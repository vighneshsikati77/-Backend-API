const express = require("express");
const path = require("path");
const collection = require("./config");
const bcrypt = require("bcrypt");
const cors = require("cors");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const multer = require("multer");

require("dotenv").config();

const app = express();

// Enable CORS
app.use(cors());

// Convert data into JSON format
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files
app.use(express.static("public"));

// Use EJS as the view engine
app.set("view engine", "ejs");

// Multer Storage Configuration for Photo Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/"); // Save images in "uploads" folder
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
    }
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed!"), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// Serve Uploaded Files
app.use("/uploads", express.static("uploads"));

// Store OTPs in memory (in production, use Redis or a DB)
const otpMap = new Map();

// 📌 Register User (Signup) with Photo Upload
app.post("/signup", upload.single("photo"), async (req, res) => {
    try {
        const { first_name, last_name, user_name, email, address, mobile_no, gender, password } = req.body;

        if (!first_name || !last_name || !user_name || !email || !address || !mobile_no || !gender || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await collection.findOne({ $or: [{ email }, { user_name }] });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Get uploaded file path (if provided)
        const photoPath = req.file ? req.file.path : null;

        const newUser = new collection({
            first_name,
            last_name,
            user_name,
            email,
            address,
            mobile_no,
            gender,
            password: hashedPassword,
            photo: photoPath
        });

        await newUser.save();

        // **Send Email Notification on Signup**
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Welcome to HubMarketocom!",
            html: `<p>Dear ${first_name},</p>
                   <p>Thank you for signing up with HubMarketocom. Your account has been created successfully.</p>
                   <p>Best Regards,<br>HubMarketocom Team</p>`,
        };

        await transporter.sendMail(mailOptions);

        res.status(201).json({ message: "Signup successful! Email sent.", user: newUser });
    } catch (error) {
        console.error("Error during signup:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 📌 Login Route
app.post("/login", async (req, res) => {
    try {
        const { email, user_name, password } = req.body;

        // Exclude soft-deleted users
        const user = await collection.findOne({ 
            $or: [{ email }, { user_name }], 
            isDeleted: false 
        });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Wrong password" });
        }

        res.status(200).json({ message: "Login successful!", user });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 📌 Edit User Profile (Including Photo Upload)
app.put("/edit-user", upload.single("photo"), async (req, res) => {
    try {
        const { email, currentpassword, first_name, last_name, user_name, gender, mobile_no, address, newpassword } = req.body;

        if (!email || !currentpassword) {
            return res.status(400).json({ message: "Email and Password are required" });
        }

        // Exclude soft-deleted users
        const user = await collection.findOne({ email, isDeleted: false });

        if (!user) {
            return res.status(404).json({ message: "User not found or deleted" });
        }

        const isPasswordMatch = await bcrypt.compare(currentpassword, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Incorrect password" });
        }

        // Check if new email or mobile number is already taken by another user
        if (email && email !== user.email) {
            const existingEmailUser = await collection.findOne({ email, _id: { $ne: user._id }, isDeleted: false });
            if (existingEmailUser) {
                return res.status(400).json({ message: "Email already in use by another user" });
            }
        }

        if (mobile_no && mobile_no !== user.mobile_no) {
            const existingMobileUser = await collection.findOne({ mobile_no, _id: { $ne: user._id }, isDeleted: false });
            if (existingMobileUser) {
                return res.status(400).json({ message: "Mobile number already in use by another user" });
            }
        }

        // Update user details if provided
        if (first_name) user.first_name = first_name;
        if (last_name) user.last_name = last_name;
        if (user_name) user.user_name = user_name;
        if (gender) user.gender = gender;
        if (mobile_no) user.mobile_no = mobile_no;
        if (address) user.address = address;

        // Update password if provided
        if (newpassword) {
            user.password = await bcrypt.hash(newpassword, 10);
        }

        // Update photo if uploaded
        if (req.file) {
            user.photo = req.file.path;
        }

        await user.save();
        res.status(200).json({ message: "User details updated successfully", user });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Internal Server error" });
    }
});


// 📌 Forgot-Password with OTP
app.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await collection.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpMap.set(email, { otp, expiresAt: Date.now() + 300000 }); // 5 min validity

        // Send OTP via Email
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your OTP for Password Reset",
            html: `<p>Your OTP for password reset is: <b>${otp}</b></p>
                   <p>This OTP is valid for 5 minutes.</p>`,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: "OTP sent to your email." });
    } catch (error) {
        console.error("Error in forgot-password:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 📌 Reset-Password with OTP
app.post("/reset-password", async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const otpData = otpMap.get(email);

        if (!otpData || otpData.expiresAt < Date.now() || otpData.otp !== otp) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        const user = await collection.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        otpMap.delete(email);

        res.status(200).json({ message: "Password reset successful!" });
    } catch (error) {
        console.error("Error in reset-password:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// 📌 Soft Delete User by Email
app.put("/soft-delete", async (req, res) => {
    try {
        const { email } = req.body;

        const user = await collection.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isDeleted) {
            return res.status(400).json({ message: "User already soft deleted" });
        }

        // Set the isDeleted flag to true (Soft delete)
        user.isDeleted = true;
        await user.save();

        res.status(200).json({ message: "User soft deleted successfully", user });
    } catch (error) {
        console.error("Error in soft delete:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 📌 Hard Delete User by Email
app.delete("/hard-delete", async (req, res) => {
    try {
        const { email } = req.body;

        const user = await collection.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Completely remove the record (Hard delete)
        await collection.deleteOne({ email });

        res.status(200).json({ message: "User hard deleted successfully" });
    } catch (error) {
        console.error("Error in hard delete:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// 📌 Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
