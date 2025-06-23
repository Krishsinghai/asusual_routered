
// Add this at the top of your router configuration
const express = require("express");
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const path = require('path');
  const Product = require("../models/Product");
  const User = require("../models/UserSchema");
  const Cart = require("../models/CartSchema");
  const Admin = require("../models/AdminSchema");
  const CustomTshirt = require("../models/CustomTshirtSchema");
  const Poster = require("../models/posterSchema");
  const Order = require("../models/OrderSchema");
  const Contact = require("../models/Contact");
  const Notification = require("../models/Notification");
  const Subscription = require("../models/subscription");
  const Testimonial = require("../models/Testimonial");
  const DeliveryCost = require("../models/Deliveryschema");
  const Coupon = require("../models/CouponSchema");


  
const checkAdminAuth = async (req, res, next) => {
  try {
    const adminId = req.session.adminId || req.cookies.adminId;
    if (!adminId) {
      return res.redirect("/admin-login");
    }
    const admin = await Admin.findById(adminId);
    if (!admin) {
      req.session.destroy();
      res.clearCookie("adminId");
      return res.redirect("/admin-login");
    }
    req.admin = admin;
    res.locals.admin = admin;
    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    req.session.destroy();
    res.clearCookie("adminId");
    res.redirect("/admin-login");
  }
};

const uploads = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit (adjust as needed)
});

const cloudinary = require('cloudinary').v2;

// Cloudinary upload options (disable quality degradation)
const cloudinaryUploadOptions = {
  resource_type: 'image',
  quality_analysis: false, // Disable automatic quality adjustment
  quality: '100', // Maximum quality (100%)
  fetch_format: 'auto', // Let Cloudinary decide format (but keep quality high)
  transformation: [
    { quality: 'auto:best' }, // Prioritize best quality
  ],
};

// For Notification Update (remains the same)
router.post("/update-notification", async (req, res) => {
  try {
    const { notification } = req.body;

    await Notification.findOneAndUpdate(
      {},
      { notification },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.redirect("/posters/edit-poster");
  } catch (error) {
    console.error("Notification Update Error:", error);
    res.status(500).send("Failed to update notification");
  }
});

router.get("/edit-poster", checkAdminAuth, async (req, res) => {
  try {
    const poster = (await Poster.findOne({})) || {
      image: ["", "", ""],
      Heading: ["", "", ""],
      Title: ["", "", ""],
    };
    const notification = (await Notification.findOne({})) || {
      notification: "",
    };
    res.render("edit_poster", { poster, notification });
  } catch (error) {
    console.error("Error loading edit-poster:", error);
    res.status(500).send("Server Error");
  }
});

router.post(
  "/edit-poster/:index",
  uploads.single("posterImage"),
  async (req, res) => {
    try {
      const index = parseInt(req.params.index);
      if (isNaN(index) || index < 0 || index > 2) {
        return res.status(400).send("Invalid poster index");
      }

      const { Heading, Title } = req.body;
      const file = req.file;

      let poster = (await Poster.findOne({})) || {
        image: ["", "", ""],
        Heading: ["", "", ""],
        Title: ["", "", ""],
      };

      const update = {
        image: [...poster.image],
        Heading: [...poster.Heading],
        Title: [...poster.Title],
      };

      if (file) {
        // Upload with quality optimization
        // AFTER (preserve quality better)
        const result = await cloudinary.uploader.upload(file.path, {
          use_filename: true,
          unique_filename: false,
          resource_type: "image",
        });

        update.image[index] = result.secure_url;
      }

      if (Heading !== undefined) update.Heading[index] = Heading;
      if (Title !== undefined) update.Title[index] = Title;

      poster = await Poster.findOneAndUpdate({}, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });

      return res.send(`
  <script>
    alert('Poster updated successfully');
    window.location.href = '/posters/edit-poster'; 
  </script>
`);
    } catch (error) {
      console.error("Error updating poster:", error);
      return res.status(500).send("Error updating poster");
    }
  }
);

router.post(
  "/edit-poster",
  uploads.fields([
    { name: "poster1", maxCount: 1 },
    { name: "poster2", maxCount: 1 },
    { name: "poster3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files;
      let poster = (await Poster.findOne({})) || {
        image: ["", "", ""],
        Heading: ["", "", ""],
        Title: ["", "", ""],
      };

      // Create a copy of existing data
      const update = {
        image: [...poster.image],
        Heading: [...poster.Heading],
        Title: [...poster.Title],
      };

      // Update only the fields that were submitted
      for (let i = 1; i <= 3; i++) {
        const field = `poster${i}`;
        if (files[field]) {
          update.image[i - 1] = files[field][0].path;
        }
        if (req.body[`Heading${i}`]) {
          update.Heading[i - 1] = req.body[`Heading${i}`];
        }
        if (req.body[`Title${i}`]) {
          update.Title[i - 1] = req.body[`Title${i}`];
        }
      }

      // Update or create the poster document
      poster = await Poster.findOneAndUpdate({}, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });

      // Change this in both POST routes
return res.send(`
  <script>
    alert('Poster updated successfully');
    window.location.href = '/posters/edit-poster';
  </script>
`);
    } catch (error) {
      console.error("Error updating poster:", error);
      return res.status(500).send("Error updating posters");
    }
  }
);

module.exports = router;