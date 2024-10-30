const mongoose = require("mongoose");
const chalk = require("chalk");


function get_users() {
  const uri = "mongodb+srv://Shrey:Shrey11_@cluster0.dmym7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0/mydatabase";


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
    about_user: {type: String,},
    is_public: {type: Boolean,required: true,},
    profile_image: { type: Buffer },
    last_active_time: { type: String },
    profile_image_type: { type: String },
    block_list:[{type:String},],
    block_by_users:[{type:String},],
    favorite_img_s:[{ type: String },],
  });

  return mongoose.model("User", userSchema);
}

function get_chats() {
  const messageSchema = new mongoose.Schema({
    receiver_email: { type: String, required: true },
    sender_email: { type: String, required: true },
    message: { type: String},
    send_time: { type: String ,required: true},
    is_read: { type: Boolean,required: true,default: false},
    read_time: { type: String},
    is_in_chat_img:{type:Boolean},
    chat_img_src: { type: Buffer }
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
