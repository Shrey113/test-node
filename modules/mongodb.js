const mongoose = require("mongoose");
const chalk = require("chalk");


// Function to connect to MongoDB and define the User schema
function get_users() {
  const uri = "mongodb+srv://Shrey:Shrey11_@cluster0.dmym7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0/mydatabase";

  // const uri = "mongodb://localhost:27017/mydatabase";
  mongoose.connect(uri)
    .then(() => console.log(chalk.green("Connected to MongoDB .. [success]")))
    .then(() => console.log(chalk.green("\nReact App Start in few seconds...\n")))
    .catch((err) => {
      console.log(chalk.green(`Could not connect to MongoDB`));
      console.error(err);
    });

  const userSchema = new mongoose.Schema({
    username: {type: String,required: true,},
    email: { type: String, required: true, unique: true,},
    password: {type: String,required: true,},
    is_public: {type: Boolean,required: true,},
  });

  return mongoose.model("User", userSchema);
}

function get_chats() {
  const messageSchema = new mongoose.Schema({
    receiver_email: { type: String, required: true },
    sender_email: { type: String, required: true },
    message: { type: String, required: true },
    time: { type: Date, default: Date.now },
  });

  const chatSchema = new mongoose.Schema({
    chat_id: { type: String, required: true, unique: true },
    participants: [{ type: String, required: true }],
    messages: [messageSchema],
  });

  return mongoose.model("Chat", chatSchema);
}


// Exporting the models
module.exports = { get_users, get_chats };
