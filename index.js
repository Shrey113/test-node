const express = require('express');
const cors = require("cors");
const jwt = require('jsonwebtoken');
const socket_io  = require("socket.io");
const http = require("http")
const morgan = require('morgan');



const {server_request_mode,write_log_file,error_message,info_message,success_message,normal_message} = require('./modules/_all_help');
const { send_welcome_page, send_otp_page } = require('./modules/send_server_email');
const { generate_otp, get_otp, clear_otp } = require('./modules/OTP_generate');
const { get_users,get_chats } = require('./modules/mongodb');

const User = get_users(); 
const Chat = get_chats();
const main_url = 'https://node-test-rose-seven.vercel.app'


const app = express();
app.use(cors({
  origin: main_url,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true  // if you're using credentials (cookies, authorization headers, etc.)
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));


const server = http.createServer(app);
const io = socket_io(server, {
  cors: {
         origin: main_url,  
         methods: ['GET', 'POST']
     }
 });
 

// app.use(morgan('dev'));



async function save_last_active(email){
  let user = await  User.findOne({email:email})
  if (user){
    user.last_active_time =  new Date().toISOString()
    await user.save();
  }
}

async function updateMessageReadStatus(chat_id_1, chat_id_2, checkEmail,sender_email,receiver_email) {

  try {
    const chats = await Chat.find({
      $or: [
        { chat_id: chat_id_1 },
        { chat_id: chat_id_2 }
      ]
    });

    if (chats.length === 0) {
      return;
    }

    for (const chat of chats) {
      let isUpdated = false;
      let list_of_updated_id = []

      chat.messages.forEach(msg => {
        if (msg.receiver_email === checkEmail && msg.is_read === false) {
          msg.is_read = true;
          isUpdated = true;
          list_of_updated_id.push(msg._id.toString()); 
        }
      });

      if (isUpdated) {
        let data = {sender_email,list_of_updated_id}        
        await chat.save();
        io.emit("send_me_as_read",data)
      }
    }
  } catch (error) {
    console.error("Error updating messages:", error);
  }
}


const PORT = 4000;
const JWT_SECRET_KEY = 'Jwt_key_for_Chat_x_app';
const HOST = '0.0.0.0';
const all_active_users = {};

io.on("connection", (socket) => {
  socket.on("user_info", (data) => {
    socket.user_email = data.user_email;
    const user_email = data.user_email;
  
    if (user_email) {
      if (all_active_users[user_email]) {
        all_active_users[user_email].connections += 1;
        all_active_users[user_email].active = true;
      } else {
        all_active_users[user_email] = { connections: 1 };
        all_active_users[user_email].active = true;
      }
      io.emit('get_list_of_active_users', all_active_users);
    }
  });
  

  socket.on('sendNotification', async (data) => {
    const { room_id, sender_email, receiver_email, message, send_time,is_read,read_time} = data; // Extract necessary data
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
            send_time: send_time ,
            is_read: is_read ,
            read_time: read_time, 
        });

        await chat.save();

        const newMessageId = chat.messages[chat.messages.length - 1]._id;

        const get_all_new_data = {
            _id: newMessageId,
            sender_email: sender_email,
            receiver_email: receiver_email,
            message: message,
            room_id: room_id,
            send_time: send_time ,
            is_read: is_read ,
            read_time: read_time, 
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

  socket.on("set_message_read",async (data)=>{
    const email = data.email
    const sender_email = data.sender_email
    const receiver_email = data.receiver_email

    let = chat_id_1 = `${sender_email}_%_%#%_%_${receiver_email}`
    let = chat_id_2 = `${receiver_email}_%_%#%_%_${sender_email}`

    updateMessageReadStatus(chat_id_1,chat_id_2,email,sender_email,receiver_email);

  });


 
  socket.on('disconnect', () => {
    const user_email = socket.user_email;
  
    if (user_email && all_active_users[user_email]) {
      all_active_users[user_email].connections -= 1;
  
      if (all_active_users[user_email].connections === 0) {
        save_last_active(user_email)
        all_active_users[user_email].active = false;
        delete all_active_users[user_email];
      }
    }
    io.emit('get_list_of_active_users', all_active_users);
  });


});


// Middleware usage
app.use((req, res, next) => {
  server_request_mode(req.method, req.url, req.body);
  next();
});


app.get("/", (req, res) => {
  res.send("Hello, server is running! go to any page to get admin page");
});


app.post('/api/get_chat', async (req, res) => {
  const { chat_id, receiver_email, sender_email, page_for_message } = req.body;
  const limit = 10;
  const skip = (page_for_message - 1) * limit;

  if (chat_id) {
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
              await chat.save();
          }

          const chatMessages = await Chat.aggregate([
              {
                  $match: {
                      $or: [
                          { chat_id: chat_id },
                          { chat_id: chatId_2 }
                      ]
                  }
              },
              {
                  $project: {
                      messages: { $reverseArray: "$messages" }
                  }
              },
              {
                  $project: {
                      messages: { $slice: ["$messages", skip, limit] }
                  }
              }
          ]);
          

          if (chatMessages.length > 0 && chatMessages[0].messages.length === 0) {
              return res.json({ show_null: "show_null" });
          }

          const messages = chatMessages[0].messages.map(msg => {
              if (msg.is_in_chat_img && msg.chat_img_src) {
                  const base64Img = msg.chat_img_src.toString('base64'); // Convert Buffer to Base64 string
                  return {
                      ...msg,
                      chat_img_src: base64Img,
                  };
              }
              return msg;
          }).reverse();

          res.json({ messages });
      } catch (error) {
          console.error("api/get_chat say: Internal Server Error", error);
          res.status(500).json({ message: 'Internal Server Error' });
      }
  } else {
      res.status(400).json({ message: 'Bad Request: chat_id is required' });
  }
});




app.post('/api/add_chat', async (req, res) => {
  const { chat_id, receiver_email, sender_email, message, send_time, chat_img } = req.body;

  try {
    const chatIdReversed = chat_id.split('_%_%#%_%_').reverse().join('_%_%#%_%_');

    // Find or create the chat
    let chat = await Chat.findOne({
      $or: [
        { chat_id: chat_id },
        { chat_id: chatIdReversed }
      ]
    });

    if (!chat) {
      chat = new Chat({
        chat_id: chat_id,
        participants: [sender_email, receiver_email],
        messages: []
      });
      await chat.save();
    }
    let imageBuffer;
    if (chat_img) {
      imageBuffer = Buffer.from(chat_img, 'base64'); 
    }

    const newMessage = {
      receiver_email,
      sender_email,
      message,
      send_time,
      is_read: false,
      read_time: null,
      is_in_chat_img: true,
      chat_img_src: imageBuffer ? { type: 'Buffer', data: Array.from(imageBuffer) } : null, // Convert Buffer to the desired format
    };

    io.emit(`new_img_add_for_${sender_email}`, newMessage);


    chat.messages.push(newMessage);
    await chat.save();

    res.status(201).json({ message: 'Chat message added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error adding chat message', error });
  }
});



app.get("/get_users", async (req, res) => {
  let email = req.query.email;

  try {
    const current_user = await User.findOne({ email });

    let filtered_users = [];

    if (current_user) {
      const user_block_list = current_user.block_list || [];
      const users_blocked_by_other_user = current_user.block_by_users || [];

      filtered_users = await User.find({
        email: { $nin: [...user_block_list, ...users_blocked_by_other_user] }
      });
    } else {
      filtered_users = await User.find();
    }

    const users_with_img_send = filtered_users.map(user => {
      const userObj = user.toObject();

      if (userObj.profile_image) {
        userObj.profile_image = `data:image/png;base64,${userObj.profile_image.toString('base64')}`;
      } else {
        userObj.profile_image = null; 
      }
      return userObj;
    });

    res.status(200).json(users_with_img_send);
  } catch (error) {
    console.error("get_users say: Failed to fetch users", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});



app.post("/block_user_by_email", async (req, res) => {
  let email = req.body.email;    
  let block_email = req.body.block_email; 
  try {
    let user = await User.findOne({ email });

    if (user) {
      if (user.block_list.includes(block_email)) {
        return res.status(201).json({ message: "User is already blocked." });
      }
      user.block_list.push(block_email);
      await user.save();

      let user_to_block = await User.findOne({ email: block_email });

      if (user_to_block) {
        if (!user_to_block.block_by_users.includes(email)) {
          user_to_block.block_by_users.push(email);
          await user_to_block.save();
        }
      }

      return res.status(200).json({ message: "User blocked successfully." });
    } else {
      return res.status(404).json({ message: "Current user not found." });
    }

  } catch (error) {
    console.error("Error blocking user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

app.post("/unblock_user_by_email", async (req, res) => {
  let email = req.body.email;         
  let unblock_email = req.body.unblock_email;
  try {
    let user = await User.findOne({ email });

    if (user) {
      if (!user.block_list.includes(unblock_email)) {
        return res.status(404).json({ message: "User is not blocked." });
      }
      user.block_list = user.block_list.filter(email => email !== unblock_email);
      await user.save();

      let userToUnblock = await User.findOne({ email: unblock_email });

      if (userToUnblock) {

        userToUnblock.block_by_users = userToUnblock.block_by_users.filter(email => email !== email);
        await userToUnblock.save();
      }

      return res.status(200).json({ message: "User unblocked successfully." });
    } else {
      return res.status(404).json({ message: "Current user not found." });
    }

  } catch (error) {
    console.error("Error unblocking user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

app.post("/block_user_list", async (req, res) => {
  const email = req.body.email;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.block_list && user.block_list.length > 0) {
      res.status(200).json({ data_list: user.block_list });
    } else {
      res.status(200).json({ data_list: [] }); // Return an empty array instead of an object for consistency
    }
  } catch (error) {
    console.error("Error fetching block user list:", error); // Log the error for debugging
    res.status(500).json({ message: "Server error" });
  }
});



app.post('/uploads', async (req, res) => {
  const { img, email } = req.body;
 
  try {
      const user = await User.findOne({ email });
      if (user) {
          const imageBuffer = Buffer.from(img, 'base64');
          user.profile_image = imageBuffer;

          await user.save();

          return res.status(200).json({ message: 'Profile image updated successfully', user });
      } else {
          return res.status(404).json({ message: 'User not found' });
      }
  } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Error updating profile image', error });
  }
});


app.post('/remove_profile_img', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && user.profile_image) {
      user.profile_image = null;
      await user.save();
      return res.status(200).json({ message: 'Profile image removed successfully' });
    } else {
      return res.status(404).json({ message: 'User or profile image not found' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error removing profile image', error });
  }
});








app.post('/update-user', async (req, res) => {
  const { email, username, password, about_user, is_public } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.username = username || user.username;
    user.password = password || user.password;
    user.about_user = about_user || user.about_user;
    user.is_public = typeof is_public === 'boolean' ? is_public : user.is_public;

    await user.save();
    res.json(user);    
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while updating the user', details: error.message });
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

// get user data from jwt
app.post("/get_user_data_from_jwt", async (req, res) => {  
  const jwt_token = req.body.jwt_token;

  if (!jwt_token) {
    error_message("get_user_data_from_jw say : JWT token is required")
    return res.status(400).send("JWT token is required");
  }

  const userData = check_jwt_token(jwt_token);
  
  const user = await User.findOne({  email: userData.email  });
  
  if (user) {
      res.json({
          message: "JWT token is valid",
          userData: user
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
