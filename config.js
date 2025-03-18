const mongoose = require('mongoose');
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully");
    })
    .catch(err => {
        console.error("❌ MongoDB Connection Error:", err);
    });

const userSchema = new mongoose.Schema({
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    user_name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    mobile_no: { type: Number, required: true, unique: true },
    gender: { type: String, required: true },
    password: { type: String, required: true },
    photo: { type: String } , // Field for storing profile photo
    isDeleted: { type: Boolean, default: false }  // Soft delete field
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;
