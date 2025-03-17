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

// Register User (Signup) with Photo Upload
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

// Login Route
app.post("/login", async (req, res) => {
    try {
        const { email, user_name, password } = req.body;
        const user = await collection.findOne({ $or: [{ email }, { user_name }] });

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

// Edit User Profile (Including Photo Upload)
app.put("/edit-user", upload.single("photo"), async (req, res) => {
    try {
        const { email, currentpassword, first_name, last_name, user_name, gender, mobile_no, address, newpassword } = req.body;

        if (!email || !currentpassword) {
            return res.status(400).json({ message: "Email and Password are required" });
        }

        const user = await collection.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isPasswordMatch = await bcrypt.compare(currentpassword, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Incorrect password" });
        }

        if (first_name) user.first_name = first_name;
        if (last_name) user.last_name = last_name;
        if (user_name) user.user_name = user_name;
        if (gender) user.gender = gender;
        if (mobile_no) user.mobile_no = mobile_no;
        if (address) user.address = address;

        if (newpassword) {
            user.password = await bcrypt.hash(newpassword, 10);
        }

        // If a new photo is uploaded, update the photo path
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

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
