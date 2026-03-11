import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || "https://iabttyfbthnemuzujghg.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhYnR0eWZidGhuZW11enVqZ2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjI1NzcsImV4cCI6MjA4ODI5ODU3N30.Mt72IcNeUrqq1lr6eeUv0m05ZZa46uhi_E7pqam4nQw";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_PASSWORD = "irtiza1234";
const ADMIN_EMAIL = "irtizascake@gmail.com";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auto-seed products if table is empty
  const seedProducts = async () => {
    try {
      const { data: existingProducts, count } = await supabase.from("products").select("id", { count: 'exact' });
      console.log(`Current product count in Supabase: ${count}`);
      if (!existingProducts || existingProducts.length === 0) {
        const productsPath = path.join(__dirname, "src", "data", "products.json");
        if (fs.existsSync(productsPath)) {
          const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
          console.log(`Auto-seeding ${products.length} products...`);
          await supabase.from("products").insert(products);
          console.log("Auto-seeding complete.");
        }
      }
    } catch (err) {
      console.error("Auto-seeding failed:", err);
    }
  };
  seedProducts();

  // Auth Routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { fullName, email, password, phone } = req.body;
      
      // Check if user exists in Supabase
      const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      
      if (checkError) {
        console.error("Supabase Check Error:", checkError);
        // If table doesn't exist, this will catch it
        if (checkError.code === 'PGRST116' || checkError.message.includes('not found')) {
           return res.status(500).json({ 
             error: "Database table not found", 
             details: "The 'users' table does not exist. Please run the SQL script in Supabase SQL Editor." 
           });
        }
        throw checkError;
      }
      
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const newUser = {
        id: `USR-${Date.now()}`,
        fullname: fullName,
        fullName: fullName,
        email,
        password,
        phone,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
      };

      // Clean up undefined values
      Object.keys(newUser).forEach(key => newUser[key] === undefined && delete newUser[key]);

      const { data, error: insertError } = await supabase
        .from("users")
        .insert([newUser])
        .select()
        .single();

      if (insertError) {
        console.error("Supabase Insert Error:", insertError);
        throw insertError;
      }
      
      const { password: _, ...userWithoutPassword } = data;
      res.json({
        ...userWithoutPassword,
        fullName: userWithoutPassword.fullname || userWithoutPassword.fullName || fullName
      });
    } catch (error) {
      console.error("Signup error details:", error);
      res.status(500).json({ 
        error: "Failed to signup", 
        details: error.message || "Unknown error",
        code: error.code
      });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("password", password)
        .maybeSingle();

      if (error) {
        console.error("Login error from Supabase:", error);
        throw error;
      }

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({
        ...userWithoutPassword,
        fullName: userWithoutPassword.fullname || userWithoutPassword.fullName // Handle both cases
      });
    } catch (error) {
      console.error("Login error details:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // API Routes
  app.get("/api/products", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*");
      
      if (error) throw error;
      res.json(data || []);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products", async (req, res) => {
    const { password, products } = req.body;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // For simplicity, we'll clear and re-insert or upsert
      // Supabase doesn't have a "replace all" easily without a delete first or upsert logic
      // We'll use upsert if products have IDs, or delete all and insert
      
      const { error: deleteError } = await supabase
        .from("products")
        .delete()
        .neq("id", "0"); // Delete all

      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from("products")
        .insert(products);

      if (insertError) throw insertError;
      
      res.json({ success: true });
    } catch (error) {
      console.error("Save products error:", error);
      res.status(500).json({ error: "Failed to save products" });
    }
  });

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const trimmedEmail = email?.trim();
    const trimmedPassword = password?.trim();
    
    if (trimmedEmail === ADMIN_EMAIL && trimmedPassword === ADMIN_PASSWORD) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid email or password" });
    }
  });

  // Order Routes
  app.get("/api/orders", async (req, res) => {
    const password = req.headers.authorization;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*");
      
      if (error) throw error;

      const mappedData = (data || []).map(o => ({
        ...o,
        shippingDetails: o.shippingDetails || o.shippingdetails,
        createdAt: o.createdAt || o.createdat
      })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(mappedData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const order = req.body;
      const orderId = `ORD-${Date.now()}`;
      
      // Construct a clean order object with multiple naming variations
      // to match whatever schema the user might have
      const now = new Date().toISOString();
      const orderToSave = {
        id: orderId,
        items: order.items,
        total: order.total,
        status: 'Pending',
        // Try all common variations for shipping details
        shipping_details: order.shippingDetails,
        shippingdetails: order.shippingDetails,
        // Try all common variations for timestamps
        created_at: now,
        createdat: now
      };

      // We try to insert. If it fails because of a specific column, 
      // we'll catch it and try a more minimal version.
      const { data, error } = await supabase
        .from("orders")
        .insert([orderToSave])
        .select()
        .single();

      if (error) {
        console.error("Primary insert failed, trying fallback:", error.message);
        
        // Fallback: Only send the most basic columns and let DB defaults handle the rest
        const minimalOrder = {
          id: orderId,
          items: order.items,
          total: order.total,
          status: 'Pending'
        };
        
        const { data: data2, error: error2 } = await supabase
          .from("orders")
          .insert([minimalOrder])
          .select()
          .single();
          
        if (error2) throw error2;
        return res.json(data2);
      }
      
      res.json(data);
    } catch (error) {
      console.error("Failed to save order:", error);
      res.status(500).json({ 
        error: "Failed to save order", 
        details: error.message,
        hint: "Please ensure your 'orders' table has the correct columns. Run the latest SQL script."
      });
    }
  });

  app.patch("/api/orders/:id", async (req, res) => {
    const { password, status } = req.body;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to update order" });
    }
  });

  app.get("/api/user/orders/:email", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*");
      
      if (error) throw error;
      
      const userOrders = (data || []).map(o => ({
        ...o,
        shippingDetails: o.shippingDetails || o.shippingdetails,
        createdAt: o.createdAt || o.createdat
      })).filter((o) => 
        o.shippingDetails?.email?.toLowerCase() === req.params.email.toLowerCase()
      );
      
      res.json(userOrders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user orders" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
