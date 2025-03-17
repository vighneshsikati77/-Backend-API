
const mongoose = require('mongoose');
const connect = mongoose.connect("mongodb://localhost:27017/HubMarketocom");

// Check database connected or not
connect.then(() => {
    console.log("Database Connected Successfully");
})
.catch(() => {
    console.log("Database cannot be Connected");
})

// // Create Schema
// const Loginschema = new mongoose.Schema({
//     first_name: { type: String, required: true },
//     last_name: { type: String, required: true },
//     email: { type: String, required: true, unique: true },
//     gender: { type: String, required: true },
//     password: { type: String, required: true },
// }, { timestamps: true });

// // collection part
// const collection = new mongoose.model("User", Loginschema);

// module.exports = collection;


// const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    user_name:{type : String, required : true, unique:true,},
    email: { type: String, required: true, unique: true },
    address:{type : String , required : true},
    mobile_no:{type : Number,required :true,unique:true},
    gender: { type: String, required: true },
    password: { type: String, required: true },
    photo: { type: String }  // Field for storing profile photo
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;