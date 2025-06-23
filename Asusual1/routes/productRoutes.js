const express = require("express");
const router = express.Router();
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
// Middleware

// Use memory storage (recommended for Cloudinary)
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

const checkAdminAuth = async (req, res, next) => {
  try {
    const adminId = req.session.adminId || req.cookies.adminId;
    if (!adminId) return res.redirect("/admin/login");

    const admin = await Admin.findById(adminId);
    if (!admin) {
      req.session.destroy();
      res.clearCookie("adminId");
      return res.redirect("/admin/login");
    }
    req.admin = admin;
    res.locals.admin = admin;
    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    req.session.destroy();
    res.clearCookie("adminId");
    res.redirect("/admin/login");
  }
};


// Helper function
function extractPublicIdFromUrl(url) {
  try {
    const splitUrl = url.split("/upload/");
    if (splitUrl.length < 2) return null;

    const pathParts = splitUrl[1].split("/");

    if (pathParts[0].startsWith("v")) {
      pathParts.shift();
    }

    const fileNameWithExt = pathParts.pop();
    const fileName = fileNameWithExt.split(".")[0];
    const folder = pathParts.join("/");

    return `${folder}/${fileName}`;
  } catch (err) {
    console.error("Failed to extract public_id from Cloudinary URL:", url);
    return null;
  }
}

// Add product form
router.get("/add-product", checkAdminAuth, (req, res) => {
  res.render("add_product");
});

router.post(
  "/add-product",
  uploads.fields([
    { name: "front_images", maxCount: 1 },
    { name: "back_image", maxCount: 1 },
    { name: "images", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      // Validate required fields
      const { name, description, price, brand, bestseller, color, category } = req.body;
      if (!name || !description || !price || !category) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields"
        });
      }

      // Validate files were uploaded
      if (!req.files || !req.files["front_images"] || !req.files["back_image"]) {
        return res.status(400).json({
          success: false,
          message: "Front and back images are required"
        });
      }

      // Process sizes
      const sizes = {
        xsmall: parseInt(req.body.sizes?.xsmall) || 0,
        small: parseInt(req.body.sizes?.small) || 0,
        medium: parseInt(req.body.sizes?.medium) || 0,
        large: parseInt(req.body.sizes?.large) || 0,
        xlarge: parseInt(req.body.sizes?.xlarge) || 0,
        xxlarge: parseInt(req.body.sizes?.xxlarge) || 0,
      };

      // Cloudinary upload function
      const uploadToCloudinary = async (file) => {
        return await cloudinary.uploader.upload(
          `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
          {
            resource_type: "auto",
            quality: "auto:best",
            fetch_format: "auto"
          }
        );
      };

      // Upload front image
      const frontImageResult = await uploadToCloudinary(req.files["front_images"][0]);

      // Upload back image
      const backImageResult = await uploadToCloudinary(req.files["back_image"][0]);

      // Upload additional images if they exist
      let additionalImagesResults = [];
      if (req.files["images"]) {
        additionalImagesResults = await Promise.all(
          req.files["images"].map(file => uploadToCloudinary(file))
        );
      }

      // Create product
      const product = new Product({
        name,
        description,
        sizes,
        price,
        brand,
        color,
        category,
        bestseller: bestseller === "on",
        front_image: frontImageResult.secure_url,
        back_image: backImageResult.secure_url,
        images: additionalImagesResults.map(img => img.secure_url),
      });

      await product.save();

      // Check if the request wants JSON response
      if (req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: "Product added successfully",
          productId: product._id
        });
      }

      return res.json({
        success: true,
        message: "Product added successfully",
        productId: product._id
      });

    } catch (error) {
      console.error("Error adding product:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to add product",
        error: error.message
      });
    }
  }
);


// router.get("/:id", async (req, res) => {
//   try {
//     const productId = req.params.id;
//     const product = await Product.findById(productId);

//     if (!product) {
//       return res.status(404).send("Product not found");
//     }

//     const userId = req.session.userId || req.cookies.userId;
//     let user = { name: "Guest" };
//     let cartCount = 0; // Initialize cart count

//     if (userId) {
//       user = await User.findById(userId, "name _id email phone createdAt");

//       // Fetch cart count if user is logged in
//       const cart = await Cart.findOne({ userId });
//       if (cart) {
//         cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
//       }
//     }

//     res.render("product_detail", {
//       product,
//       user,
//       productId: product._id,
//       cartCount // Pass cartCount to the template
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Server error");
//   }
// });

// All products

router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: "desc" }).lean();
    const notification = (await Notification.findOne({})) || {
      notification: "",
    };
    const availableColors = [
      ...new Set(
        products
          .map((p) => p.color?.toLowerCase())
          .filter((color) => color)
      ),
    ];

    // Get user data if logged in
    const userId = req.session.userId || req.cookies.userId;
    let user = null;
    let cartCount = 0;

    if (userId) {
      user = await User.findById(userId, "name _id email");
      // Get cart count if needed
      const cart = await Cart.findOne({ userId });
      cartCount = cart ? cart.items.reduce((total, item) => total + item.quantity, 0) : 0;
    }

    res.render("allProduct", {
      notification,
      products: products.map((p) => ({
        ...p,
        id: p._id.toString(),
      })),
      availableColors,
      user, // Pass user to template
      cartCount // Pass cart count if needed
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Error fetching products");
  }
});

// Edit product form
// GET route to display all products for editing
router.get("/edit-product", checkAdminAuth, async (req, res) => {
  try {
    const products = await Product.find(
      {},
      "name price front_image category brand bestseller sizes description"
    ).lean();

    const updatedProducts = products.map(product => ({
      ...product,
      front_image: product.front_image || null
    }));

    res.render("edit_product", { products: updatedProducts });
  } catch (error) {
    console.error("Error loading edit products:", error);
    res.status(500).send(`
      <script>
        alert('Failed to load products: ${error.message.replace(/'/g, "\\'")}');
        window.location.href = '/admin/dashboard';
      </script>
    `);
  }
});

// Product details

router.get("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).send("Product not found");
    }

    const userId = req.session.userId || req.cookies.userId;
    let user = { name: "Guest" };

    if (userId) {
      user = await User.findById(userId, "name _id");
    }

    const cartCount = req.session.cart ? req.session.cart.length : 0; // ✅ Add this line

    res.render("product_detail", {
      product,
      user,
      productId: product._id,
      cartCount, // ✅ Pass this to EJS
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});


// POST route to update a product
router.post(
  "/edit-product/:id",
  checkAdminAuth,
  uploads.fields([
    { name: "front_image", maxCount: 1 },
    { name: "back_image", maxCount: 1 },
    { name: "images", maxCount: 5 }
  ]),
  async (req, res) => {
    const { id } = req.params;

    try {
      // Validate product ID
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).send(`
          <script>
            alert('Invalid product ID');
            window.location.href = '/products/edit-product';
          </script>
        `);
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).send(`
          <script>
            alert('Product not found');
            window.location.href = '/products/edit-product';
          </script>
        `);
      }

      // Prepare update data
      const updateData = {
        name: req.body.name,
        description: req.body.description,
        price: req.body.price,
        brand: req.body.brand,
        category: req.body.category,
        bestseller: req.body.bestseller === 'true',
        sizes: {
          xsmall: parseInt(req.body.sizes?.xsmall) || 0,
          small: parseInt(req.body.sizes?.small) || 0,
          medium: parseInt(req.body.sizes?.medium) || 0,
          large: parseInt(req.body.sizes?.large) || 0,
          xlarge: parseInt(req.body.sizes?.xlarge) || 0,
          xxlarge: parseInt(req.body.sizes?.xxlarge) || 0
        }
      };

      // Handle file uploads
      const uploadImage = async (file, oldUrl) => {
        if (oldUrl) {
          const publicId = extractPublicIdFromUrl(oldUrl);
          if (publicId) await cloudinary.uploader.destroy(publicId);
        }

        return await cloudinary.uploader.upload(
          `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
          {
            quality: "auto:best",
            fetch_format: "auto",
            width: 800,
            height: 1000,
            crop: "fill",
            gravity: "auto:faces"
          }
        );
      };

      // Process front image
      if (req.files?.front_image?.[0]) {
        const result = await uploadImage(req.files.front_image[0], product.front_image);
        updateData.front_image = result.secure_url;
      }

      // Process back image
      if (req.files?.back_image?.[0]) {
        const result = await uploadImage(req.files.back_image[0], product.back_image);
        updateData.back_image = result.secure_url;
      }

      // Process additional images
      if (req.files?.images) {
        // Delete old images
        for (const imageUrl of product.images) {
          const publicId = extractPublicIdFromUrl(imageUrl);
          if (publicId) await cloudinary.uploader.destroy(publicId);
        }

        // Upload new images
        const uploadPromises = req.files.images.map(file =>
          uploadImage(file, null)
        );
        const results = await Promise.all(uploadPromises);
        updateData.images = results.map(img => img.secure_url);
      }

      // Update product
      await Product.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

      return res.send(`
        <script>
          alert('Product updated successfully!');
          window.location.href = '/products/edit-product';
        </script>
      `);
    } catch (error) {
      console.error("Error updating product:", error);
      return res.status(500).send(`
        <script>
          alert('Failed to update product: ${error.message.replace(/'/g, "\\'")}');
          window.location.href = '/products/edit-product/${id}';
        </script>
      `);
    }
  }
);
// Delete product
router.post("/delete/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).send("Product not found");

    const idsToDelete = [
      extractPublicIdFromUrl(product.front_image),
      extractPublicIdFromUrl(product.back_image),
      ...product.images.map((img) => extractPublicIdFromUrl(img)),
    ];

    console.log("Attempting to delete the following Cloudinary public_ids:", idsToDelete);

    for (const id of idsToDelete) {
      if (id) {
        const result = await cloudinary.uploader.destroy(id);
        console.log(`Deleted ${id}:`, result);
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    res.redirect("/products/edit-product");
  } catch (err) {
    console.error("Deletion error:", err);
    res.status(500).send("Error deleting product and images");
  }
});



module.exports = router;