const express = require('express');
const cors = require("cors");
const jwt = require('jsonwebtoken');
const socket_io  = require("socket.io");
const http = require("http")
const morgan = require('morgan');

const {write_log_file,error_message,info_message,success_message,normal_message} = require('./modules/_all_help');
const { send_welcome_page, send_otp_page } = require('./modules/send_server_email');
const { generate_otp, get_otp, clear_otp } = require('./modules/OTP_generate');
const { get_users,get_chats } = require('./modules/mongodb');

const User = get_users(); 
const Chat = get_chats();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = socket_io(server, {
  cors: {
    origin: 'http://localhost:3000',
  }
});

// app.use(morgan('dev'));


const PORT = 4000;
const JWT_SECRET_KEY = 'Jwt_key_for_Chat_x_app';
const HOST = '0.0.0.0';
const all_active_users = {};

io.on("connection", (socket) => {
  socket.on("user_info", (data) => {
    socket.user_email = data.user_email;
    const user_email = data.user_email;
  
    if (user_email) {
      // If the user already exists, increment the connection count
      if (all_active_users[user_email]) {
        all_active_users[user_email].connections += 1;
        all_active_users[user_email].active = true;
      } else {
        all_active_users[user_email] = { connections: 1 };
        all_active_users[user_email].active = true;
      }
      io.emit('get_list_of_active_users', all_active_users);
    }
    // console.log("Updated active users C:", all_active_users);
  });
  

  socket.on('sendNotification', async (data) => {
    const { room_id, sender_email, receiver_email, message, time } = data; // Extract necessary data
    try {

        const room_id_2 = room_id.split('_%_%#%_%_').reverse().join('_%_%#%_%_');
        let chat = await Chat.findOne({
            $or: [
                { chat_id: room_id },
                { chat_id: room_id_2 }
            ]
        });

        if (!chat) {
            chat = new Chat({
                chat_id: room_id,
                participants: [sender_email, receiver_email],
                messages: []
            });
            await chat.save();
        }

        chat.messages.push({
            sender_email: sender_email,
            receiver_email: receiver_email, 
            message: message,
            timestamp: time 
        });

        await chat.save();

        const get_all_new_data = {
            sender_email: sender_email,
            receiver_email: receiver_email,
            message: message,
            room_id: room_id
        };

        io.emit('data-updated', get_all_new_data);
    } catch (error) {
        console.error('Error handling sendNotification:', error);
    }
  });

  socket.on('chat_typing_start_at',(data)=>{
    io.emit('show_type_animation',data)
  });

  socket.on('chat_typing_end_at',(data)=>{
    io.emit('off_type_animation',data)
  });


 
  socket.on('disconnect', () => {
    const user_email = socket.user_email;
  
    if (user_email && all_active_users[user_email]) {
      all_active_users[user_email].connections -= 1;
  
      if (all_active_users[user_email].connections === 0) {
        all_active_users[user_email].active = false;
        delete all_active_users[user_email];
      }
    }
    // console.log("User disconnected:", all_active_users);
    io.emit('get_list_of_active_users', all_active_users);
  });


});

app.get("/", (req, res) => {
  res.send("Hello, server is running! go to any page to get admin page");
});


let test = 0;
app.post('/api/get_chat', async (req, res) => {
  const { chat_id, receiver_email, sender_email } = req.body; // Get emails from the request body

  
  if (chat_id) {
      try {
          const chatId_2 = chat_id.split('_%_%#%_%_').reverse().join('_%_%#%_%_'); // Reverse the order of the emails

          let chat = await Chat.findOne({
              $or: [
                  { chat_id: chat_id },
                  { chat_id: chatId_2 }
              ]
          });

          // If chat not found, create a new chat
          if (!chat) {
              chat = new Chat({
                  chat_id: chat_id,
                  participants: [sender_email, receiver_email], // Use the sender and reverser emails
                  messages: [],
              });
              await chat.save();
          }
          test++;
          console.log("Start get chats count : -",test);
          
          res.json(chat.messages || chat);
      } catch (error) {
          error_message("api/get_chat say : Internal Server Error")
          console.log(error);
          res.status(500).json({ message: 'Internal Server Error' });
      }
  }
});


app.post('/api/send_message', async (req, res) => {
  const { message, receiver_email, sender_email, chat_id } = req.body;

  if (!message || !receiver_email || !sender_email) {
      error_message("api/send_message : message, receiver_email and sender_email are rquired")
      return res.status(400).json({ message: 'Missing required fields' });
  }

  try {


      const chatId_2 = chat_id.split('_%_%#%_%_').reverse().join('_%_%#%_%_'); 

      let chat = await Chat.findOne({
          $or: [
              { chat_id: chat_id },
              { chat_id: chatId_2 }
          ]
      });

      if (!chat) {
          chat = new Chat({
              chat_id: chat_id,
              participants: [sender_email, receiver_email],
              messages: [],
          });
      }

      const newMessage = {
          message,
          receiver_email,
          sender_email,
          time: new Date()
      };

      chat.messages.push(newMessage);
      await chat.save();

      res.status(200).json({ message: 'Message sent successfully', newMessage });
  } catch (error) {
      error_message("api/send_message say : Internal Server Error")
      console.error(error);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});


// / get all users from MongoDB
app.get("/get_users", async (req, res) => {
  try {
    const users = await User.find(); 
    res.status(200).json(users); 
  } catch (error) {
    error_message("get_users say : Failed to fetch users")
    console.error(error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});






// helper -- 1
function create_jwt_token(email,username,password){
  let data_for_jwt = {email,username,password}
  let jwt_token = jwt.sign(data_for_jwt,JWT_SECRET_KEY)
  return jwt_token;
}

// helper -- 2
function check_jwt_token(jwt_token) {
  try {
      const data = jwt.verify(jwt_token, JWT_SECRET_KEY);
      return data; // Return the decoded token data
  } catch (err) {
      console.error(err);
      return null; // Return null if the token is invalid
  }
}

// /get_user_data_from_jwt
app.post("/get_user_data_from_jwt", (req, res) => {  
  const jwt_token = req.body.jwt_token;

  if (!jwt_token) {
    error_message("get_user_data_from_jw say : JWT token is required")
    return res.status(400).send("JWT token is required");
  }

  const userData = check_jwt_token(jwt_token);

  if (userData) {
      res.json({
          message: "JWT token is valid",
          userData: userData // Include user data if available
      });
  } else {
      res.status(401).send("JWT token is invalid");
  }
});


// /send_welcome_email
app.post("/send_welcome_email", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    error_message("send_welcome_email Email is required")
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    await send_welcome_page(email);
    res.status(200).json({ message: `Welcome email sent to ${email}` });
  } catch (error) {
    console.error("send_welcome_email Error sending welcome email:", error);
    res.status(500).json({ error: "Failed to send welcome email" });
  }
});

// -- login -------------------------------------------
// -- login -------------------------------------------
// -- login -------------------------------------------
app.post("/login_user", async (req, res) => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      error_message("login_user say : Email and password are required")
      return res.status(400).json({ error: "Email and password are required" });
    }
  
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(200).json({ error: "Invalid email or password" });
      }
      const isPasswordValid = user.password === password; 
  
      if (!isPasswordValid) {
        return res.status(200).json({ error: "Invalid email or password" });
      }
      let token = create_jwt_token(user.email, user.username, user.password);
      
      res.status(200).json({ message: "Login successful", token });
    } catch (error) {
      console.error("Error logging in user:", error);
      error_message("login_user say : Failed to log in user")
      res.status(500).json({ error: "Failed to log in user" });
    }
});

// /send_otp_email - with a already exists
app.post("/send_otp_email", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    error_message("send_otp_email say : Email is required")
    return res.status(400).json({ error: "Email is required" });
  }

  const existing_user = await User.findOne({ email });
  if (existing_user) {
    return res.status(200).json({ error: "User with this email already exists" });
  }

  try {
    const otp = generate_otp(email); 
    info_message(`An email has been sent to ${email}.OTP is ${otp}.`);

    await send_otp_page(email, otp);
    res.status(200).json({ message: `OTP email sent to ${email}` });
  } catch (error) {
    console.error("Error sending OTP email:", error);
    res.status(500).json({ error: "Failed to send OTP email" });
  }
});

// -- register-------------------------------------------
// -- register-------------------------------------------
// -- register-------------------------------------------

app.post("/add_user", async (req, res) => {
  const { email, username, password ,is_public } = req.body;
  if (!email || !username || !password) {
    error_message("add_user say : Email, username and password are rquired")
    return res.status(400).json({ error: "Email, username and password are required" });

  }
  try {

    const existing_user = await User.findOne({ email });
    if (existing_user) {
      return res.status(200).json({ error: "User with this email already exists" });
    }

    const newUser = new User({ username, email, password ,is_public });
    await newUser.save();

    let token = create_jwt_token(email,username,password);
    res.status(201).json({ message: "User registered successfully",token});

  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// -- Forgot Password-------------------------------------------
// -- Forgot Password-------------------------------------------
// -- Forgot Password-------------------------------------------

app.post("/send_otp_email_if_exists", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    error_message("send_otp_email_if_exists say : Email is required")
    return res.status(400).json({ error: "Email is required" });
  }

  const existing_user = await User.findOne({ email });
  if (!existing_user) {
    return res.status(200).json({ error: "User with this email Not  exists" });
  }

  try {
    const otp = generate_otp(email); 
    info_message(`An email has been sent to ${email}.OTP is ${otp}.`);

    await send_otp_page(email, otp);
    res.status(200).json({ message: `OTP email sent to ${email}` });
  } catch (error) {
    console.error("Error sending OTP email:", error);
    res.status(500).json({ error: "Failed to send OTP email" });
  }
});

app.post("/verify_otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    error_message("verify_otp say : Email and OTP are required")
    return res.status(400).json({ error: "Email and OTP are required" });
  }
  try {
    const storedOtp = get_otp(email);

    if (storedOtp && storedOtp === otp) {
      res.status(200).json({ message: "OTP verified successfully" });
    } else {
      res.status(200).json({ error: "Invalid OTP" });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

app.post("/change_user_password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    error_message("change_user_password say : Email and new password are required")
    return res.status(400).json({ error: "Email and new password are required" });
  }

  try {
 
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ error: "Failed to update password" });
  }
});


// Start the server
// Start the server

const ADMIN_USERNAME = 'admin';  
const ADMIN_PASSWORD = 'admin123';


app.get('/get_routes', (req, res) => {
  const routes = [];

  app._app.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        method: Object.keys(middleware.route.methods)[0].toUpperCase(),
        path: middleware.route.path
      });
    }
  });

  res.json(routes); // Return the routes as a JSON response
});

app.post('/validate-admin', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.status(200).json({ success: true });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// 404 page
app.use((req, res) => {
  res.status(404).sendFile(__dirname + '/index.html'); 
});


const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
      for (const net of interfaces[interfaceName]) {
          // Check if the interface is an IPv4 address and is not a loopback
          if (net.family === 'IPv4' && !net.internal) {
              return net.address
          }
      }
  }
}

server.listen(PORT,HOST, () => {
  console.log(`\nServer running at \n`);
  console.log(`\tLocal:            http://localhost:${PORT}`);
  console.log(`\tOn Your Network:  http://${getLocalIP()}:${PORT}\n`);
});
