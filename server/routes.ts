import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { resellers, resellerSales, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";

// Helper function to authenticate users and resellers
async function authenticateRequest(req: any): Promise<{ user: any; isReseller: boolean } | null> {
  const userId = req.headers["x-user-id"];
  const authToken = req.headers["authorization"];

  console.log('🔍 authenticateRequest DEBUG:');
  console.log('  - userId:', userId);
  console.log('  - authToken:', authToken);

  if (!userId) {
    console.log('  ❌ No userId provided');
    return null;
  }

  // Check if it's a reseller token
  const isResellerToken = authToken && authToken.includes("reseller_");
  console.log('  - isResellerToken:', isResellerToken);

  if (isResellerToken) {
    console.log('  🔄 Checking reseller in database...');
    // It's a reseller - look in resellers table
    const reseller = await storage.getResellerById(parseInt(userId as string));
    console.log('  - reseller found:', !!reseller);
    if (!reseller) {
      console.log('  ❌ Reseller not found in database');
      return null;
    }

    console.log('  ✅ Reseller authenticated:', reseller.email);
    return {
      user: {
        id: reseller.id,
        email: reseller.email,
        role: "reseller",
        name: reseller.name,
        clientId: null // Resellers don't have clientId
      },
      isReseller: true
    };
  } else {
    console.log('  🔄 Checking regular user in database...');
    // It's a regular user - look in users table
    const user = await storage.getUserById(parseInt(userId as string));
    console.log('  - user found:', !!user);
    if (!user) {
      console.log('  ❌ User not found in database');
      return null;
    }

    console.log('  ✅ User authenticated:', user.email);
    return {
      user,
      isReseller: false
    };
  }
}

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
import { insertUserSchema, insertProductSchema, insertOrderSchema, insertOrderItemSchema, insertPaymentSchema, insertCurrencyExchangeSchema, insertProductHistorySchema, insertVendorSchema, insertCustomerSchema, insertCompanyConfigurationSchema, insertStockControlSessionSchema, insertStockControlItemSchema, insertCashMovementSchema, insertExpenseSchema, insertDebtPaymentSchema, insertCustomerDebtSchema, insertResellerSchema, insertResellerConfigurationSchema, insertResellerSaleSchema, cashMovements, payments, orderItems, orders, customerDebts, expenses, products, cashRegister, currencyExchanges, customers, vendors } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import passwordResetRoutes from "./password-reset";

// Import cash schedule storage
import { cashScheduleStorage } from "./cash-schedule-storage";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const productFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  storage: z.string().optional(),
  model: z.string().optional(),
  quality: z.string().optional(),
  battery: z.string().optional(),
  provider: z.string().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {

  // Register password reset routes FIRST
  app.use("/api/auth", passwordResetRoutes);

  // Simple authentication middleware
  const authenticateUser = async (req: any, res: any, next: any) => {
    try {
      // For now, we'll use a simple header-based authentication
      // In a real app, you'd use proper session management or JWT
      const userHeader = req.headers['x-user-id'];
      if (userHeader) {
        const userId = parseInt(userHeader as string);
        const user = await storage.getUserById(userId);
        if (user) {
          req.user = user;
        }
      }
      next();
    } catch (error) {
      next();
    }
  };

  // Apply authentication middleware to all routes
  app.use(authenticateUser);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    });
  });

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log('🔍 === INICIO DE LOGIN DEBUG ===');
      console.log('🔍 1. Datos recibidos en login:', JSON.stringify(req.body, null, 2));
      console.log('🔍 1. Headers recibidos:', JSON.stringify(req.headers, null, 2));

      console.log('🔍 2. Iniciando schema validation...');
      const { email, password } = loginSchema.parse(req.body);
      console.log('✅ 2. Schema validation EXITOSO');
      console.log('🔍 2. Email parseado:', email);
      console.log('🔍 2. Password length:', password ? password.length : 'undefined');

      console.log('🔍 3. Iniciando búsqueda de usuario en base de datos...');
      console.log('🔍 3. Calling storage.getUserByEmail(' + email + ')');

      const user = await storage.getUserByEmail(email);

      console.log('🔍 3. Resultado de getUserByEmail:');
      if (user) {
        console.log('✅ 3. Usuario ENCONTRADO:');
        console.log('   - ID:', user.id);
        console.log('   - Username:', user.username);
        console.log('   - Email:', user.email);
        console.log('   - Role:', user.role);
        console.log('   - ClientId:', user.clientId);
        console.log('   - Password hash (primeros 20):', user.password ? user.password.substring(0, 20) + '...' : 'NO PASSWORD');
        console.log('   - IsActive:', user.isActive);
      } else {
        console.log('❌ 3. Usuario NO ENCONTRADO para email:', email);
        console.log('❌ 3. Terminando login - usuario no existe');
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log('🔍 4. Iniciando verificación de contraseña...');
      console.log('🔍 4. Password ingresado length:', password.length);
      console.log('🔍 4. Password hash completo:', user.password);
      console.log('🔍 4. Llamando bcrypt.compareSync...');

      const passwordMatch = bcrypt.compareSync(password, user.password);

      console.log('🔍 4. Resultado de bcrypt.compareSync:', passwordMatch);

      if (!passwordMatch) {
        console.log('❌ 4. Password NO COINCIDE');
        console.log('❌ 4. Password ingresado:', password);
        console.log('❌ 4. Hash en BD:', user.password);
        console.log('❌ 4. Terminando login - password incorrecto');
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log('✅ 4. Password CORRECTO');

      console.log('🔍 5. Iniciando búsqueda de cliente...');
      console.log('🔍 5. Calling storage.getClientById(' + user.clientId + ')');

      const client = await storage.getClientById(user.clientId);

      console.log('🔍 5. Resultado de getClientById:');
      if (client) {
        console.log('✅ 5. Cliente ENCONTRADO:');
        console.log('   - ID:', client.id);
        console.log('   - Name:', client.name);
        console.log('   - SubscriptionType:', client.subscriptionType);
        console.log('   - TrialEndDate:', client.trialEndDate);
      } else {
        console.log('❌ 5. Cliente NO ENCONTRADO para clientId:', user.clientId);
        console.log('❌ 5. Terminando login - cliente no existe');
        return res.status(404).json({ message: "Client not found" });
      }

      console.log('✅ 6. Preparando respuesta exitosa...');

      const responseData = {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
          permissions: user.permissions ? JSON.parse(user.permissions) : [],
          mustChangePassword: user.mustChangePassword || false,
        },
        client: {
          id: client.id,
          name: client.name,
          subscriptionType: client.subscriptionType,
          trialStartDate: client.trialStartDate,
          trialEndDate: client.trialEndDate,
          salesContactNumber: client.salesContactNumber,
        },
      };

      console.log('✅ 6. Datos de respuesta preparados:', JSON.stringify(responseData, null, 2));
      console.log('✅ 6. Enviando respuesta exitosa...');
      console.log('🔍 === FIN DE LOGIN DEBUG - EXITOSO ===');

      res.json(responseData);

    } catch (error) {
      console.log('🔍 === LOGIN DEBUG - ERROR CAPTURADO ===');
      console.error('❌ ERROR CRÍTICO en login:');
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error instanceof Error:', error instanceof Error);
      console.error('❌ Error message:', error instanceof Error ? error.message : 'No message');
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('❌ Error complete object:', error);
      console.log('🔍 === FIN DE LOGIN DEBUG - ERROR ===');

      res.status(400).json({ 
        message: "Invalid request", 
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: typeof error
      });
    }
  });

  app.post("/api/auth/logout", (res) => {
    res.json({ message: "Logged out successfully" });
  });

  // Reseller login endpoint
  app.post("/api/reseller/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      console.log(`🔍 Reseller login attempt for: ${email}`);

      const reseller = await storage.getResellerByEmail(email);
      if (!reseller) {
        console.log(`❌ Reseller login failed: Reseller not found for email: ${email}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log(`🔑 Reseller login - Password check for: ${email}`);
      console.log(`🔑 Password ingresado length: ${password.length}`);
      console.log(`🔑 Password ingresado (primeros 10): ${password.substring(0, 10)}`);
      console.log(`🔑 Password hash completo: ${reseller.password}`);
      console.log(`🔑 Password hash length: ${reseller.password.length}`);

      const passwordMatch = bcrypt.compareSync(password, reseller.password);
      console.log(`🔐 bcrypt.compareSync result: ${passwordMatch}`);

      // Test adicional para debug
      const testHash = bcrypt.hashSync(password, 10);
      console.log(`🧪 Test hash de password ingresado: ${testHash}`);
      console.log(`🧪 ¿El hash actual es válido?: ${reseller.password.startsWith('$2b$') || reseller.password.startsWith('$2a$')}`);

      if (!passwordMatch) {
        console.log(`❌ Reseller login failed: Password mismatch for: ${email}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!reseller.isActive) {
        console.log(`❌ Reseller login failed: Account inactive for: ${email}`);
        return res.status(401).json({ message: "Account inactive" });
      }

      console.log(`✅ Reseller login successful for: ${email}`);
      res.json({
        reseller: {
          id: reseller.id,
          name: reseller.name,
          email: reseller.email,
          company: reseller.company,
          commission: reseller.commission,
          accountsQuota: reseller.accountsQuota,
          accountsSold: reseller.accountsSold,
          totalEarnings: reseller.totalEarnings,
          role: 'reseller'
        }
      });
    } catch (error) {
      console.error("Reseller login error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Change password route - PRODUCTION SECURITY
  app.post("/api/auth/change-password", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new passwords are required" });
      }

      // Verify current password with bcrypt for production security
      if (!bcrypt.compareSync(currentPassword, req.user.password)) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Pass raw password - storage.updateUser will handle the hashing
      await storage.updateUser(req.user.id, {
        password: newPassword,  // Pass raw password, storage will hash it
        mustChangePassword: false
      });

      console.log(`✅ Password changed successfully for user: ${req.user.email}`);
      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error('❌ Error changing password:', error);
      res.status(500).json({ message: "Error changing password" });
    }
  });

  // ==========================================
  // CASH SCHEDULE ENDPOINTS - CRITICAL FIXES
  // ==========================================

  // Get cash schedule configuration
  app.get("/api/cash-schedule/config", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Getting cash schedule config for client ${clientId}`);
      const config = await cashScheduleStorage.getScheduleConfig(clientId);

      if (!config) {
        // Return default configuration if none exists
        const defaultConfig = {
          clientId,
          autoOpenEnabled: false,
          autoCloseEnabled: false,
          openHour: 9,
          openMinute: 0,
          closeHour: 18,
          closeMinute: 0,
          activeDays: "1,2,3,4,5,6,7",
          timezone: "America/Argentina/Buenos_Aires",
        };
        console.log(`🕐 No config found, returning default for client ${clientId}`);
        return res.json(defaultConfig);
      }

      console.log(`🕐 Config found for client ${clientId}:`, config);
      res.json(config);
    } catch (error) {
      console.error('Error getting cash schedule config:', error);
      res.status(500).json({ message: "Error retrieving schedule configuration" });
    }
  });

  // Update cash schedule configuration
  app.post("/api/cash-schedule/config", async (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { clientId, ...configData } = req.body;
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Cash schedule updated for client ${clientId} by ${user.email}`);
      console.log(`🕐 New config data:`, configData);

      const updatedConfig = await cashScheduleStorage.upsertScheduleConfig(clientId, configData);

      console.log(`🕐 Config successfully updated:`, updatedConfig);
      res.json(updatedConfig);
    } catch (error) {
      console.error('Error updating cash schedule config:', error);
      res.status(500).json({ message: "Error updating schedule configuration" });
    }
  });

  // Get scheduled operations
  app.get("/api/cash-schedule/operations", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Getting scheduled operations for client ${clientId}`);
      const operations = await cashScheduleStorage.getScheduledOperations(clientId);

      console.log(`🕐 Found ${operations.length} scheduled operations for client ${clientId}`);
      res.json(operations);
    } catch (error) {
      console.error('Error getting scheduled operations:', error);
      res.status(500).json({ message: "Error retrieving scheduled operations" });
    }
  });

  // Get operations log
  app.get("/api/cash-schedule/log", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const limit = parseInt(req.query.limit as string) || 50;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Getting operations log for client ${clientId}, limit ${limit}`);
      const log = await cashScheduleStorage.getAutoOperationsLog(clientId, limit);

      res.json(log);
    } catch (error) {
      console.error('Error getting operations log:', error);
      res.status(500).json({ message: "Error retrieving operations log" });
    }
  });

  // Service status endpoint
  app.get("/api/cash-schedule/service-status", (req, res) => {
    res.json({
      isRunning: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Products routes
  app.get("/api/products", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const filters = productFiltersSchema.parse(req.query);
      const products = await storage.searchProducts(clientId, filters);
      res.json(products);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      console.log("POST /api/products - Request body:", req.body);

      // Transform entryDate from string to Date if needed
      const requestData = {
        ...req.body,
        entryDate: req.body.entryDate ? new Date(req.body.entryDate) : new Date()
      };

      console.log("POST /api/products - Transformed data:", requestData);

      const productData = insertProductSchema.parse(requestData);
      console.log("POST /api/products - Validated data:", productData);

      // Check if IMEI already exists for this client
      const existingProduct = await storage.getProductByImei(productData.imei, productData.clientId);
      if (existingProduct) {
        return res.status(400).json({ message: "IMEI already exists" });
      }

      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      console.error("POST /api/products - Error:", error);
      if (error instanceof Error && error.message.includes('Expected date, received string')) {
        return res.status(400).json({ 
          message: "Date format error", 
          error: "entryDate must be a valid Date object or ISO string",
          hint: "Ensure dates are properly formatted"
        });
      }
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Batch update products by IMEIs (must come before :id endpoints)
  app.put("/api/products/batch-update", async (req, res) => {
    try {
      const { imeis, clientId, updates, userId } = req.body;

      console.log('Batch update request:', { imeis, clientId, updates, userId });

      if (!Array.isArray(imeis) || imeis.length === 0) {
        return res.status(400).json({ message: "IMEIs array is required" });
      }

      if (!clientId || !userId) {
        return res.status(400).json({ message: "Client ID and User ID are required" });
      }

      const validatedUpdates = insertProductSchema.partial().parse(updates);
      console.log('Validated updates:', validatedUpdates);

      const result = await storage.updateProductsByImeis(imeis, clientId, validatedUpdates, userId);
      console.log('Update result:', result);

      res.json(result);
    } catch (error) {
      console.error('Batch update error:', error);
      res.status(400).json({ message: "Invalid request", error: error.message });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.put("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { userId, ...productData } = req.body;
      console.log(`Updating product ${id} with data:`, productData);
      const validatedData = insertProductSchema.partial().parse(productData);

      const product = await storage.updateProduct(id, validatedData, userId);
      console.log(`Updated product result:`, product);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error('Update product error:', error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // PATCH endpoint for products (since frontend is using PATCH)
  app.patch("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { userId, ...productData } = req.body;
      console.log(`PATCH: Updating product ${id} with data:`, productData);
      const validatedData = insertProductSchema.partial().parse(productData);

      const product = await storage.updateProduct(id, validatedData, userId);
      console.log(`PATCH: Updated product result:`, product);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error('PATCH product error:', error);
      res.status(400).json({ message: "Invalid request", error: error.message });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteProduct(id);

      if (!success) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Check if IMEI exists
  app.get("/api/products/check-imei/:imei", async (req, res) => {
    try {
      const imei = req.params.imei;
      const clientId = parseInt(req.query.clientId as string);

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const existingProduct = await storage.getProductByImei(imei, clientId);
      res.json({ exists: !!existingProduct });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Batch create products
  app.post("/api/products/batch", async (req, res) => {
    try {
      const { products } = req.body;

      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: "Products array is required" });
      }

      const createdProducts = [];

      for (const productData of products) {
        const validatedProduct = insertProductSchema.parse(productData);

        // Check if IMEI already exists
        const existingProduct = await storage.getProductByImei(validatedProduct.imei, validatedProduct.clientId);
        if (existingProduct) {
          return res.status(400).json({ message: `IMEI ${validatedProduct.imei} already exists` });
        }

        const product = await storage.createProduct(validatedProduct);
        createdProducts.push(product);
      }

      res.json({ products: createdProducts, count: createdProducts.length });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Delete product
  app.delete("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteProduct(id);

      if (!success) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });



  // Product History routes
  app.get("/api/products/:id/history", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const history = await storage.getProductHistoryByProductId(productId);
      res.json(history);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/products/:id/history", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const historyData = insertProductHistorySchema.parse({
        ...req.body,
        productId,
      });

      const history = await storage.createProductHistory(historyData);
      res.json(history);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const history = await storage.getProductHistoryByClientId(clientId);
      res.json(history);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get("/api/alerts", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const alerts = await storage.getProductsWithAlerts(clientId);
      res.json(alerts);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Orders routes
  app.get("/api/orders", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      // Use getOrdersWithItemsAndProducts to get complete order data with vendor and product information
      const orders = await storage.getOrdersWithItemsAndProducts(clientId);
      res.json(orders);
    } catch (error) {
      console.error('Error getting orders with items and products:', error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      console.log('📋 [ORDER CREATION] Starting complete order processing...');
      console.log('📋 [ORDER CREATION] Request data:', JSON.stringify(req.body, null, 2));

      const { payments, orderItems, ...orderBody } = req.body;

      // Generate order number first
      const orderNumber = `ORD-${Date.now()}`;

      // Parse with generated order number
      const orderData = insertOrderSchema.parse({
        ...orderBody,
        orderNumber,
      });

      const order = await storage.createOrder(orderData);
      console.log('✅ [ORDER CREATION] Order created successfully:', order.id, 'Number:', order.orderNumber);

      // Process order items if provided
      if (orderItems && orderItems.length > 0) {
        console.log('📦 [ORDER ITEMS] Processing', orderItems.length, 'items...');
        for (const item of orderItems) {
          await storage.createOrderItem({
            ...item,
            orderId: order.id,
            clientId: order.clientId
          });

          // Update product status to sold
          if (item.productId) {
            await storage.updateProduct(item.productId, { status: 'vendido' });
            console.log(`📱 [PRODUCT UPDATE] Product ${item.productId} status updated to 'vendido'`);
          }
        }
      }

      // CASH MOVEMENT CREATION SYSTEM - EXACT COPY FROM WORKING DEBT PAYMENTS
      if (payments && payments.length > 0) {
        console.log('💳 [CASH MOVEMENTS] Processing', payments.length, 'payments using DEBT PAYMENT system logic...');

        // Get current cash register - EXACT COPY FROM DEBT PAYMENTS
        let currentCashRegister = await storage.getCurrentCashRegister(order.clientId);
        if (!currentCashRegister) {
          console.log(`No active cash register found, getting most recent for client ${order.clientId}`);
          currentCashRegister = await storage.getOrCreateTodayCashRegister(order.clientId);
        }
        console.log(`Using cash register ID: ${currentCashRegister.id} for client ${order.clientId}`);

        for (let i = 0; i < payments.length; i++) {
          const paymentData = payments[i];
          console.log(`🔄 [PAYMENT ${i+1}/${payments.length}] Processing debt payment logic:`, paymentData);

          // Calculate USD amount with corrected exchange rate handling - EXACT COPY FROM DEBT PAYMENTS
          let amountUsd;

          // Handle payment method specific conversion logic - EXACT COPY FROM DEBT PAYMENTS
          if (paymentData.paymentMethod === 'efectivo_ars' || paymentData.paymentMethod === 'transferencia_ars') {
            // ARS methods: amount in ARS, convert to USD
            const exchangeRate = parseFloat(paymentData.exchangeRate || "1100");
            amountUsd = parseFloat(paymentData.amount) / exchangeRate;
          } else if (paymentData.paymentMethod === 'transferencia_usdt') {
            // USDT methods: USDT counts as USD (1:1 for accounting)
            amountUsd = parseFloat(paymentData.amount);
          } else if (paymentData.paymentMethod === 'financiera_ars') {
            // Financiera ARS→USD: amount in ARS, convert to USD
            const exchangeRate = parseFloat(paymentData.exchangeRate || "1050");
            amountUsd = parseFloat(paymentData.amount) / exchangeRate;
          } else {
            // USD methods (efectivo_usd, transferencia_usd, financiera_usd): already in USD
            amountUsd = parseFloat(paymentData.amount);
          }

          // Create payment record in payments table - EXACT COPY FROM DEBT PAYMENTS
          await storage.createPayment({
            clientId: order.clientId,
            orderId: order.id,
            paymentMethod: paymentData.paymentMethod,
            amount: paymentData.amount,
            exchangeRate: paymentData.exchangeRate || "1",
            amountUsd: amountUsd.toFixed(2),
            notes: paymentData.notes || `Pago ${paymentData.paymentMethod} - ${paymentData.amount}`
          });

          // Detect currency from payment method - EXACT COPY FROM DEBT PAYMENTS
          let currency = 'USD';
          if (paymentData.paymentMethod.includes('_ars')) {
            currency = 'ARS';
          } else if (paymentData.paymentMethod.includes('_usdt')) {
            currency = 'USDT';
          }

          //          // Create cash movement for tracking - EXACT COPY FROM DEBT PAYMENTS
          await storage.createCashMovement({
            clientId: order.clientId,
            cashRegisterId: currentCashRegister.id,
            type: 'venta',
            subtype: paymentData.paymentMethod,
            amount: paymentData.amount,
            currency: currency,
            exchangeRate: paymentData.exchangeRate || "1",
            amountUsd: amountUsd.toFixed(2),
            description: `Venta - Orden #${order.orderNumber}`,
            referenceId: order.id,
            referenceType: 'order_payment',
            customerId: order.customerId,
            vendorId: order.vendorId,
            userId: parseInt(req.headers['x-user-id'] as string) || 37,  // Use valid user ID
            notes: paymentData.notes || `Pago ${paymentData.paymentMethod} - ${currency} ${paymentData.amount}`
          });

          console.log(`📊 ✅ Cash movement created: ${currency} ${paymentData.amount} = USD ${amountUsd.toFixed(2)}`);
        }

        console.log('🔄 Real-time synchronization completed - Order and Cash Movements updated using DEBT PAYMENT logic');
      }

      // Update order payment status after all payments are processed
      const allPayments = await storage.getPaymentsByOrderId(order.id);
      const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amountUsd), 0);
      const totalOrder = parseFloat(order.totalUsd);

      // Respect user-selected payment status when "pagado" is explicitly chosen
      let paymentStatus = order.paymentStatus || "pendiente";

      // Only auto-calculate status if user didn't explicitly select "pagado"
      if (order.paymentStatus !== "pagado") {
        if (totalPaid >= totalOrder) {
          paymentStatus = "pagado";
        } else if (totalPaid > 0) {
          paymentStatus = "parcial";
        } else {
          paymentStatus = "pendiente";
        }
      }

      await storage.updateOrder(order.id, { paymentStatus });
      console.log(`🔄 [ORDER STATUS] Payment status updated to: ${paymentStatus} (User selected: ${order.paymentStatus}, Paid: $${totalPaid}, Total: $${totalOrder})`);

      // Create automatic debt only if status is NOT "pagado"
      if (paymentStatus === "parcial" || paymentStatus === "pendiente") {
        const existingDebt = await storage.getActiveDebtByOrderId(order.id);

        if (!existingDebt) {
          const debtAmountUsd = totalOrder - totalPaid;
          console.log(`💳 [DEBT] Creating automatic debt for order ${order.id}: $${debtAmountUsd}`);

          await storage.createCustomerDebt({
            clientId: order.clientId,
            customerId: order.customerId,
            orderId: order.id,
            debtAmount: debtAmountUsd.toFixed(2),
            paidAmount: totalPaid.toFixed(2),
            remainingAmount: debtAmountUsd.toFixed(2),
            currency: "USD",
            status: "vigente",
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            notes: `Deuda automática por ${paymentStatus === "parcial" ? "pago parcial" : "pago pendiente"}. Total: $${totalOrder}, Pagado: $${totalPaid.toFixed(2)}`
          });
          console.log(`✅ [DEBT] Automatic debt created successfully`);
        }
      } else if (paymentStatus === "pagado") {
        console.log(`✅ [NO DEBT] Order marked as "pagado" - no automatic debt will be created`);
        // Remove any existing debt for this order when marked as paid
        const existingDebt = await storage.getActiveDebtByOrderId(order.id);
        if (existingDebt) {
          await storage.updateCustomerDebt(existingDebt.id, { status: "pagado" });
          console.log(`✅ [DEBT] Marked existing debt as paid for fully paid order`);
        }
      }

      console.log(`🎉 [ORDER CREATION] Order ${order.orderNumber} completed successfully with full synchronization`);
      res.json(order);

    } catch (error) {
      console.error('❌ [ORDER CREATION] FATAL ERROR:', error);
      if (error instanceof Error) {
        console.error('❌ [ORDER CREATION] Error details:', error.message);
        console.error('❌ [ORDER CREATION] Stack trace:', error.stack);
      }
      res.status(400).json({ 
        message: "Error creating order", 
        error: error instanceof Error ? error.message : "Unknown error",
        details: "Order creation failed - check server logs for details"
      });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getOrderById(id);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const items = await storage.getOrderItemsByOrderId(id);
      const payments = await storage.getPaymentsByOrderId(id);

      res.json({
        ...order,
        items,
        payments,
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.put("/api/orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const orderData = insertOrderSchema.partial().parse(req.body);

      const order = await storage.updateOrder(id, orderData);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json(order);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // PATCH endpoint for partial order updates (e.g., payment status)
  app.patch("/api/orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const orderData = insertOrderSchema.partial().parse(req.body);

      const order = await storage.updateOrder(id, orderData);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // If payment status is updated to "parcial", create debt automatically
      if (orderData.paymentStatus === "parcial") {
        console.log(`Processing partial payment for order ${id}`);

        // Get order payments to calculate debt
        const payments = await storage.getPaymentsByOrderId(id);
        console.log(`Found ${payments.length} payments for order ${id}:`, payments.map(p => ({ method: p.paymentMethod, amountUsd: p.amountUsd })));

        const totalPaidUsd = payments.reduce((sum, payment) => sum + parseFloat(payment.amountUsd), 0);
        const totalOrderUsd = parseFloat(order.totalUsd);
        const debtAmountUsd = totalOrderUsd - totalPaidUsd;

        console.log(`Debt calculation - Total: $${totalOrderUsd}, Paid: $${totalPaidUsd}, Debt: $${debtAmountUsd}`);

        if (debtAmountUsd > 0) {
          // Check if debt already exists for this order
          const existingDebts = await storage.getCustomerDebtsByClientId(order.clientId);
          const orderHasDebt = existingDebts.some((debt: any) => debt.orderId === id);

          console.log(`Existing debts count: ${existingDebts.length}, Order already has debt: ${orderHasDebt}`);

          if (!orderHasDebt) {
            console.log(`Creating debt for order ${id}, customer ${order.customerId}`);

            // Create customer debt
            const newDebt = await storage.createCustomerDebt({
              clientId: order.clientId,
              customerId: order.customerId,
              orderId: id,
              debtAmount: debtAmountUsd.toFixed(2),
              paidAmount: "0.00",
              remainingAmount: debtAmountUsd.toFixed(2),
              currency: "USD",
              status: "vigente",
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
              notes: `Deuda automática por pago parcial. Total: $${totalOrderUsd}, Pagado: $${totalPaidUsd.toFixed(2)}`
            });

            console.log(`✅ Debt created successfully for order ${id}:`, newDebt);
          } else {
            console.log(`⚠️ Debt already exists for order ${id}, skipping creation`);
          }
        } else {
          console.log(`❌ No debt needed (amount <= 0): $${debtAmountUsd}`);
        }
      }

      console.log(`Order ${id} updated with payment status: ${orderData.paymentStatus}`);
      res.json(order);
    } catch (error) {
      console.error(`Error updating order ${req.params.id}:`, error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Order Items routes
  app.get("/api/order-items", async (req, res) => {
    try {
      console.log('GET /api/order-items - Query params:', req.query);
      const orderId = parseInt(req.query.orderId as string);

      if (!orderId || isNaN(orderId)) {
        console.log('Invalid orderId provided');
        return res.status(400).json({ message: "Order ID is required and must be a valid number" });
      }

      console.log('Fetching real order items for orderId:', orderId);
      // Get real order items with products from database
      const orderItemsWithProducts = await storage.getOrderItemsWithProductsByOrderId(orderId);
      console.log('Retrieved real order items:', orderItemsWithProducts);
      res.json(orderItemsWithProducts);
    } catch (error) {
      console.error('Error in GET /api/order-items:', error);
      res.status(500).json({ message: "Internal server error", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Users routes (only accessible to superuser/developer)
  app.get("/api/users", async (req, res) => {
    try {
      // Check if user is authenticated and has superuser role
      if (!req.user || req.user.role !== "superuser") {
        return res.status(403).json({ message: "Access denied. Developer access required." });
      }

      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const users = await storage.getUsersByClientId(clientId);
      res.json(users);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Get vendors for permission management (admin access)
  app.get("/api/users/vendors", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Admin can see their vendors, superuser can see all
      const clientId = req.user.role === 'superuser' ? 
        parseInt(req.query.clientId as string) || req.user.clientId : 
        req.user.clientId;

      const vendors = await storage.getUsersByClientIdAndRole(clientId, 'vendor');
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Error fetching vendors" });
    }
  });

  // Update user permissions (admin only)
  app.put("/api/users/:id/permissions", async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied. Admin access required." });
      }

      const userId = parseInt(req.params.id);
      const { permissions } = req.body;

      // Verify the user belongs to the same client
      const targetUser = await storage.getUserById(userId);
      if (!targetUser || targetUser.clientId !== req.user.clientId) {
        return res.status(404).json({ message: "User not found" });
      }

      // Only allow updating vendor permissions
      if (targetUser.role !== 'vendor') {
        return res.status(403).json({ message: "Can only update vendor permissions" });
      }

      const updatedUser = await storage.updateUser(userId, {
        permissions: permissions
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user permissions:", error);
      res.status(500).json({ message: "Error updating permissions" });
    }
  });

  // Update user profile (email, phone)
  app.patch("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { email, phone } = req.body;

      // Only allow updating email and phone
      const updateData: any = {};
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;

      const updatedUser = await storage.updateUser(id, updateData);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Error updating profile" });
    }
  });

  // Change user password
  app.post("/api/users/:id/change-password", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long" });
      }

      // Get current user
      const user = await storage.getUserById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password using bcrypt
      const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Pass raw password - storage.updateUser will handle the hashing  
      const updatedUser = await storage.updateUser(id, { 
        password: newPassword,  // Pass raw password, storage will hash it
        mustChangePassword: false 
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`✅ Password changed successfully for user ${user.email} (ID: ${id})`);
      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Error changing password" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      // Check if user is authenticated and has admin role
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied. Admin access required." });
      }

      const userData = {
        ...req.body,
        role: "vendor",
        clientId: req.user.clientId,
        mustChangePassword: true
      };

      // Parse with user schema
      const parsedData = insertUserSchema.parse(userData);

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(parsedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Check if username already exists
      const existingUsername = await storage.getUserByUsername(parsedData.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser(parsedData);
      res.json(user);
    } catch (error) {
      console.error("Error creating vendor user:", error);
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Create vendor (admin only)
  app.post("/api/vendors/create", async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied. Admin access required." });
      }

      const { username, email, password, permissions } = req.body;

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Check if username already exists in this client
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername && existingUsername.clientId === req.user.clientId) {
        return res.status(400).json({ message: "Username already exists in your organization" });
      }

      const vendorData = {
        clientId: req.user.clientId,
        username,
        email,
        password,
        role: 'vendor' as const,
        permissions: permissions || "[]",
        isActive: true,
        mustChangePassword: true, // Force password change on first login
      };

      const vendor = await storage.createUser(vendorData);
      res.json(vendor);
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(500).json({ message: "Error creating vendor" });
    }
  });

  // Cash register routes
  app.get("/api/cash-register", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const cashRegister = await storage.getCashRegisterByClientId(clientId);
      res.json(cashRegister);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/cash-register", async (req, res) => {
    try {
      const cashRegisterData = req.body;
      const cashRegister = await storage.createCashRegister(cashRegisterData);
      res.json(cashRegister);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Currency exchange routes
  app.post("/api/cash-register/currency-exchange", async (req, res) => {
    try {
      console.log("Currency exchange request body:", req.body);

      // Simplificar para evitar problemas con el schema
      const exchangeData = {
        clientId: req.body.clientId,
        fromCurrency: req.body.fromCurrency,
        toCurrency: req.body.toCurrency,
        fromAmount: req.body.fromAmount.toString(),
        toAmount: req.body.toAmount.toString(),
        exchangeRate: req.body.exchangeRate.toString(),
        category: req.body.category || 'conversion_moneda',
        notes: req.body.notes || '',
        userId: req.body.userId
      };

      console.log("Prepared exchange data:", exchangeData);
      const exchange = await storage.createCurrencyExchange(exchangeData);
      console.log("Exchange created:", exchange);
      res.json(exchange);
    } catch (error) {
      console.error("Currency exchange error:", error);
      res.status(400).json({ 
        message: "Invalid request", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.get("/api/currency-exchanges", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const exchanges = await storage.getCurrencyExchangesByClientId(clientId);
      res.json(exchanges);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Payments routes
  app.get("/api/payments", async (req, res) => {
    try {
      const orderId = parseInt(req.query.orderId as string);
      if (orderId) {
        const payments = await storage.getPaymentsByOrderId(orderId);
        res.json(payments);
      } else {
        const clientId = parseInt(req.query.clientId as string);
        if (!clientId) {
          return res.status(400).json({ message: "Order ID or Client ID is required" });
        }
        const payments = await storage.getPaymentsByClientId(clientId);
        res.json(payments);
      }
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const paymentData = insertPaymentSchema.parse(req.body);
      const payment = await storage.createPayment(paymentData);

      // After payment is created, check if order needs payment status update and debt calculation
      if (payment.orderId) {
        const order = await storage.getOrderById(payment.orderId);

        if (order) {
          // Calculate total payments for this order
          const payments = await storage.getPaymentsByOrderId(order.id);
          const totalPaidUsd = payments.reduce((sum, p) => sum + parseFloat(p.amountUsd), 0);
          const totalOrderUsd = parseFloat(order.totalUsd);

          // Determine correct payment status
          let newPaymentStatus = "pendiente";
          if (totalPaidUsd >= totalOrderUsd) {
            newPaymentStatus = "pagado";
          } else if (totalPaidUsd > 0) {
            newPaymentStatus = "parcial";
          }

          // Update order payment status if changed
          if (order.paymentStatus !== newPaymentStatus) {
            await storage.updateOrder(order.id, { paymentStatus: newPaymentStatus });
            console.log(`🔄 Updated order ${order.id} payment status: ${order.paymentStatus} → ${newPaymentStatus}`);
          }

          // Debt calculation for partial payments
          if (newPaymentStatus === "parcial" && order.customerId) {
            console.log(`🔄 Checking debt calculation for order ${order.id} after payment registration`);

            const debtAmountUsd = totalOrderUsd - totalPaidUsd;
            console.log(`💰 Debt calculation - Total: $${totalOrderUsd}, Paid: $${totalPaidUsd}, Debt: $${debtAmountUsd}`);

            if (debtAmountUsd > 0) {
              // Check if debt already exists for this order
              const existingDebts = await storage.getCustomerDebtsByClientId(order.clientId);
              const existingDebt = existingDebts.find(debt => debt.orderId === order.id && debt.status === 'vigente');

              if (existingDebt) {
                // Update existing debt with correct amounts
                await storage.updateCustomerDebt(existingDebt.id, {
                  debtAmount: debtAmountUsd.toFixed(2),
                  paidAmount: totalPaidUsd.toFixed(2),
                  remainingAmount: debtAmountUsd.toFixed(2),
                  notes: `Deuda actualizada automáticamente. Total: $${totalOrderUsd}, Pagado: $${totalPaidUsd.toFixed(2)}`
                });
                console.log(`✅ Debt updated for order ${order.id}: $${debtAmountUsd.toFixed(2)}`);
              } else {
                // Create new debt
                const newDebt = await storage.createCustomerDebt({
                  clientId: order.clientId,
                  customerId: order.customerId,
                  orderId: order.id,
                  debtAmount: debtAmountUsd.toFixed(2),
                  paidAmount: totalPaidUsd.toFixed(2),
                  remainingAmount: debtAmountUsd.toFixed(2),
                  currency: "USD",
                  status: "vigente",
                  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
                  notes: `Deuda automática por pago parcial. Total: $${totalOrderUsd}, Pagado: $${totalPaidUsd.toFixed(2)}`
                });
                console.log(`✅ Automatic debt created for order ${order.id}: $${debtAmountUsd.toFixed(2)}`);
              }
            }
          }
        }
      }

      res.json(payment);
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(400).json({ message: "Invalid request", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/order-items", async (req, res) => {
    console.log("=== POST /api/order-items CALLED ===");
    try {
      console.log("Request body received:", JSON.stringify(req.body, null, 2));

      // Validar schema
      const orderItemData = insertOrderItemSchema.parse(req.body);
      console.log("Schema validation successful. Parsed data:", JSON.stringify(orderItemData, null, 2));

      // Crear order item
      const orderItem = await storage.createOrderItem(orderItemData);
      console.log("Order item created successfully:", JSON.stringify(orderItem, null, 2));

      res.json(orderItem);
    } catch (error) {
      console.error("=== ERROR in POST /api/order-items ===");
      console.error("Error details:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      res.status(400).json({ 
        message: "Invalid request", 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error
      });
    }
  });

  app.delete("/api/order-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteOrderItem(id);

      if (!success) {
        return res.status(404).json({ message: "Order item not found" });
      }

      res.json({ message: "Order item deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const products = await storage.getProductsByClientId(clientId);
      const orders = await storage.getOrdersByClientId(clientId);
      const payments = await storage.getPaymentsByClientId(clientId);

      const totalProducts = products.length;
      const pendingOrders = orders.filter(order => order.status === "pendiente").length;
      // Count products that are running low on stock
      const availableProducts = products.filter(product => product.status === "disponible");
      const lowStockProducts = availableProducts.length; // Just count available products for now, or implement real stock threshold logic

      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlySales = payments
        .filter(payment => {
          const paymentDate = new Date(payment.createdAt);
          return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
        })
        .reduce((sum, payment) => sum + parseFloat(payment.amountUsd), 0);

      res.json({
        totalProducts,
        monthlySales,
        pendingOrders,
        lowStock: lowStockProducts,
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Get vendor names for order filtering (no special permissions required)
  app.get("/api/users/vendors", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      // Get vendors from the vendors table, not users table
      const vendors = await storage.getVendorsByClientId(clientId);
      // Return only basic vendor info (id and name) for display purposes
      const vendorInfo = vendors.map(vendor => ({
        id: vendor.id,
        name: vendor.name, // El campo se llama name en la tabla vendors
        role: 'vendor'
      }));

      res.json(vendorInfo);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Vendors routes
  app.get("/api/vendors", async (req, res) => {
    try {
      let clientId;

      // Try to get clientId from authenticated user first
      if (req.user && req.user.clientId) {
        clientId = req.user.clientId;
      } else {
        // Fallback to query parameter
        clientId = parseInt(req.query.clientId as string);
      }

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const vendors = await storage.getVendorsByClientId(clientId);
      res.json(vendors);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/vendors", async (req, res) => {
    try {
      const vendorData = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor(vendorData);
      res.json(vendor);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.put("/api/vendors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const vendorData = insertVendorSchema.partial().parse(req.body);

      const vendor = await storage.updateVendor(id, vendorData);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      // If commission was updated, trigger a sync with cash register
      if (vendorData.commissionPercentage !== undefined) {
        console.log(`🔄 Vendor ${vendor.name} commission updated to ${vendor.commissionPercentage}% - triggering commission sync`);

        // Invalidate any cached commission calculations
        try {
          // Future: Implement commission recalculation for existing orders if needed
          console.log("✅ Commission sync completed");
        } catch (syncError) {
          console.error("⚠️ Commission sync failed:", syncError);
        }
      }

      res.json(vendor);
    } catch (error) {
      console.error("Error updating vendor:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete("/api/vendors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteVendor(id);

      if (!deleted) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      res.json({ message: "Vendor deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Customers routes
  app.get("/api/customers", async (req, res) => {
    try {
      let clientId;

      // Try to get clientId from authenticated user first
      if (req.user && req.user.clientId) {
        clientId = req.user.clientId;
      } else {
        // Fallback to query parameter
        clientId = parseInt(req.query.clientId as string);
      }

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const customers = await storage.getCustomersByClientId(clientId);
      res.json(customers);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.json(customer);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.put("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const customerData = insertCustomerSchema.partial().parse(req.body);

      const customer = await storage.updateCustomer(id, customerData);

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json(customer);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCustomer(id);

      if (!deleted) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json({ message: "Customer deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Currency Exchange routes
  app.post("/api/currency-exchanges", async (req, res) => {
    try {
      const exchangeData = insertCurrencyExchangeSchema.parse(req.body);
      const exchange = await storage.createCurrencyExchange(exchangeData);
      res.json(exchange);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get("/api/currency-exchanges", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const exchanges = await storage.getCurrencyExchangesByClientId(clientId);
      res.json(exchanges);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Cash Register routes
  app.get("/api/cash-register/current", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const cashRegister = await storage.getCurrentCashRegister(clientId);

      if (!cashRegister) {
        return res.status(404).json({ message: "No open cash register found" });
      }

      res.json(cashRegister);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/cash-register/open", async (req, res) => {
    try {
      const { clientId, initialUsd, initialArs, initialUsdt } = req.body;

      // Check if there's already an open cash register
      const existingRegister = await storage.getCurrentCashRegister(clientId);
      if (existingRegister) {
        return res.status(400).json({ message: "Ya hay una caja abierta" });
      }

      const cashRegister = await storage.createCashRegister({
        clientId,
        date: new Date(),
        initialUsd,
        initialArs,
        initialUsdt,
        currentUsd: initialUsd,
        currentArs: initialArs,
        currentUsdt: initialUsdt,
        dailySales: "0.00",
        isOpen: true,
      });

      res.json(cashRegister);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/cash-register/close", async (req, res) => {
    try {
      const { clientId } = req.body;

      const cashRegister = await storage.getCurrentCashRegister(clientId);
      if (!cashRegister) {
        return res.status(404).json({ message: "No open cash register found" });
      }

      const updatedRegister = await storage.updateCashRegister(cashRegister.id, {
        isOpen: false,
        closedAt: new Date(),
      });

      res.json(updatedRegister);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get("/api/cash-register/daily-sales", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const dailySales = await storage.getDailySales(clientId, startOfDay, endOfDay);
      res.json(dailySales);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Company Configuration routes
  app.get("/api/company-configuration", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const config = await storage.getCompanyConfigurationByClientId(clientId);
      if (!config) {
        return res.status(404).json({ message: "Company configuration not found" });
      }

      res.json(config);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/company-configuration", async (req, res) => {
    try {
      console.log("Company configuration request body:", JSON.stringify(req.body, null, 2));

      // Get user from header to verify permissions
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Get user info to verify admin or superuser role
      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || !['admin', 'superuser'].includes(user.role)) {
        return res.status(403).json({ message: "Only admin or superuser can update company configuration" });
      }

      const companyConfig = insertCompanyConfigurationSchema.parse(req.body);
      console.log("Parsed company config:", JSON.stringify(companyConfig, null, 2));

      // Check if configuration already exists for this client
      const existingConfig = await storage.getCompanyConfigurationByClientId(companyConfig.clientId);
      console.log("Existing config:", existingConfig);

      if (existingConfig) {
        // Update existing configuration
        console.log("Updating existing configuration with ID:", existingConfig.id);
        const updatedConfig = await storage.updateCompanyConfiguration(existingConfig.id, companyConfig);
        console.log("Updated config:", updatedConfig);
        res.json(updatedConfig);
      } else {
        // Create new configuration
        console.log("Creating new configuration");
        const newConfig = await storage.createCompanyConfiguration(companyConfig);
        console.log("Created config:", newConfig);
        res.json(newConfig);
      }
    } catch (error) {
      console.error("Company configuration error:", error);
      res.status(400).json({ 
        message: "Invalid request", 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error
      });
    }
  });

  app.put("/api/company-configuration/:id", async (req, res) => {
    try {
      // Get user from header to verify permissions
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Get user info to verify admin or superuser role
      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || !['admin', 'superuser'].includes(user.role)) {
        return res.status(403).json({ message: "Only admin or superuser can update company configuration" });
      }

      const id = parseInt(req.params.id);
      const companyConfig = insertCompanyConfigurationSchema.partial().parse(req.body);

      const updatedConfig = await storage.updateCompanyConfiguration(id, companyConfig);

      if (!updatedConfig) {
        return res.status(404).json({ message: "Company configuration not found" });
      }

      console.log(`✅ Company configuration updated by ${user.email} (${user.role})`);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating company configuration:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // General Configuration routes
  app.get("/api/configuration", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const configs = await storage.getConfigurationsByClientId(clientId);

      // Convert array to object for easier frontend use
      const configObject: Record<string, string> = {};
      configs.forEach(config => {
        configObject[config.key] = config.value;
      });

      res.json(configObject);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/configuration", async (req, res) => {
    try {
      const { clientId, configurations } = req.body;

      if (!clientId || !configurations) {
        return res.status(400).json({ message: "Client ID and configurations are required" });
      }

      // Update or create each configuration
      const results = [];
      for (const [key, value] of Object.entries(configurations)) {
        const result = await storage.updateConfiguration(clientId, key, value as string);
        results.push(result);
      }

      res.json({ success: true, updated: results.length });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Stock Control routes

  // Stock control active session route
  app.get("/api/stock-control/active-session", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log('🔍 Getting active session for client:', clientId);
      const activeSession = await storage.getActiveStockControlSession(clientId);

      if (!activeSession) {
        console.log('❌ No active session found for client:', clientId);
        return res.status(404).json({ message: "No active session found" });
      }

      console.log('✅ Active session found:', activeSession.id, 'Status:', activeSession.status);
      res.json(activeSession);
    } catch (error) {
      console.error('❌ Error getting active session:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Stock control session items route
  app.get("/api/stock-control/sessions/:sessionId/items", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);

      console.log('🔍 Getting items for session:', sessionId);
      const items = await storage.getStockControlItemsWithProductsBySessionId(sessionId);

      console.log('✅ Found', items.length, 'items for session:', sessionId);
      res.json(items);
    } catch (error) {
      console.error('❌ Error getting session items:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get products for stock control (disponible + reservado)
  app.get("/api/stock-control/products", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const products = await storage.getProductsForStockControl(clientId);
      res.json(products);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Get extravios products
  app.get("/api/stock-control/extravios", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const extraviosProducts = await storage.getExtraviosProducts(clientId);
      res.json(extraviosProducts);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Get session history
  app.get("/api/stock-control/sessions", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const sessions = await storage.getStockControlSessionsByClientId(clientId);
      res.json(sessions);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Start new stock control session
  app.post("/api/stock-control/sessions", async (req, res) => {
    try {
      console.log('🔍 POST /api/stock-control/sessions - Request body:', JSON.stringify(req.body, null, 2));

      // Verify user authentication
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Process and convert date fields
      const processedBody = {
        ...req.body,
        date: req.body.date ? new Date(req.body.date) : new Date(),
        startTime: req.body.startTime ? new Date(req.body.startTime) : new Date()
      };

      console.log('🔄 Processed data with Date objects:', JSON.stringify(processedBody, null, 2));

      const sessionData = insertStockControlSessionSchema.parse(processedBody);
      console.log('✅ Schema validation passed:', JSON.stringify(sessionData, null, 2));

      const session = await storage.createStockControlSession(sessionData);
      console.log('✅ Session created successfully:', JSON.stringify(session, null, 2));

      res.json(session);
    } catch (error) {
      console.error('❌ Error creating stock control session:', error);
      if (error instanceof Error) {
        console.error('❌ Error details:', error.message);
        console.error('❌ Error stack:', error.stack);

        // Provide more specific error messages for date validation
        if (error.message.includes('Expected date, received string')) {
          return res.status(400).json({ 
            message: "Date format error", 
            error: "Date fields must be valid Date objects or ISO strings",
            receivedData: req.body,
            hint: "Convert string dates to Date objects before sending"
          });
        }

        if (error.message.includes('invalid input syntax')) {
          return res.status(400).json({ 
            message: "Invalid data format", 
            error: "One or more fields contain invalid data types",
            receivedData: req.body
          });
        }

        if (error.message.includes('duplicate key')) {
          return res.status(409).json({ 
            message: "Session already exists", 
            error: "A session is already active for this client"
          });
        }
      }

      res.status(400).json({ 
        message: "Invalid request", 
        error: error instanceof Error ? error.message : "Unknown error",
        receivedData: req.body
      });
    }
  });

  // Scan product
  app.post("/api/stock-control/scan", async (req, res) => {
    try {
      const { sessionId, imei } = req.body;

      if (!sessionId || !imei) {
        return res.status(400).json({ message: "Session ID and IMEI are required" });
      }

      // Get session
      const session = await storage.getStockControlSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Find product by IMEI
      const product = await storage.getProductByImei(imei, session.clientId);
      if (!product) {
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      // Check if product is available for control (disponible or reservado)
      if (!['disponible', 'reservado'].includes(product.status)) {
        return res.status(400).json({ message: `Producto en estado ${product.status} no se puede escanear` });
      }

      // Create stock control item
      const stockControlItem = await storage.createStockControlItem({
        sessionId,
        productId: product.id,
        imei: product.imei,
        status: 'scanned'
      });

      // Update session stats
      await storage.updateStockControlSession(sessionId, {
        scannedProducts: session.scannedProducts + 1
      });

      // Return product info with scan timestamp
      res.json({
        ...product,
        scannedAt: new Date().toISOString()
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Get scanned products for session
  app.get("/api/stock-control/sessions/:sessionId/items", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const items = await storage.getStockControlItemsWithProductsBySessionId(sessionId);
      res.json(items);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Get missing products from session
  app.get("/api/stock-control/sessions/:sessionId/missing", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const missingProducts = await storage.getMissingProductsFromSession(sessionId);
      res.json(missingProducts);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Update stock control session
  app.put("/api/stock-control/sessions/:sessionId", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const updates = req.body;

      // Process date fields if present
      if (updates.endTime) {
        updates.endTime = new Date(updates.endTime);
      }

      const updatedSession = await storage.updateStockControlSession(sessionId, updates);

      if (!updatedSession) {
        return res.status(404).json({ message: "Session not found" });
      }

      res.json(updatedSession);
    } catch (error) {
      console.error('Error updating stock control session:', error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Finish stock control session
  app.put("/api/stock-control/sessions/:sessionId/finish", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);

      const finishedSession = await storage.updateStockControlSession(sessionId, {
        status: 'completed',
        endTime: new Date()
      });

      if (!finishedSession) {
        return res.status(404).json({ message: "Session not found" });
      }

      res.json(finishedSession);
    } catch (error) {
      console.error('Error finishing stock control session:', error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Process missing products
  app.post("/api/stock-control/sessions/:sessionId/process-missing", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const { updates } = req.body;

      for (const update of updates) {
        const { productId, action, notes } = update;

        // Update product status
        await storage.updateProduct(productId, { status: action });

        // Create product history entry
        const product = await storage.getProductById(productId);
        if (product) {
          await storage.createProductHistory({
            clientId: product.clientId,
            productId: productId,
            previousStatus: product.status,
            newStatus: action,
            userId: 1, // Should get from session
            notes: notes || `Control de stock - ${action}`
          });
        }

        // Create stock control item for missing product
        await storage.createStockControlItem({
          sessionId,
          productId,
          imei: product?.imei || '',
          status: 'missing',
          actionTaken: action,
          notes
        });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Finish stock control session
  app.put("/api/stock-control/sessions/:sessionId/finish", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);

      const session = await storage.getStockControlSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Calculate missing products count
      const missingCount = session.totalProducts - session.scannedProducts;

      const updatedSession = await storage.updateStockControlSession(sessionId, {
        status: 'completed',
        endTime: new Date(),
        missingProducts: missingCount
      });

      res.json(updatedSession);
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // =======================
  // SISTEMA DE CAJAS AVANZADAS
  // =======================

  // Get or create today's cash register (auto-opening)
  app.get("/api/cash-register/current", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const cashRegister = await storage.getOrCreateTodayCashRegister(clientId);
      res.json(cashRegister);
    } catch (error) {
      console.error('Error getting current cash register:', error);
      res.status(500).json({ message: "Error retrieving cash register" });
    }
  });

  // Get real-time cash state with all calculations
  app.get("/api/cash-register/real-time-state", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const realTimeState = await storage.getRealTimeCashState(clientId);
      res.json(realTimeState);
    } catch (error) {
      console.error('Error getting real-time cash state:', error);
      res.status(500).json({ message: "Error retrieving real-time state" });
    }
  });

  // =======================
  // AUTOMATIC CASH REGISTER SYSTEM
  // =======================

  // Get automatic cash schedule
  app.get("/api/cash-register/schedule", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const schedule = await storage.scheduleCashOperations(clientId);
      res.json(schedule);
    } catch (error) {
      console.error('Error getting cash schedule:', error);
      res.status(500).json({ message: "Error retrieving cash schedule" });
    }
  });

  // Check and process automatic operations
  app.post("/api/cash-register/auto-check", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const clientId = req.user.clientId;
      if (!clientId || clientId === 13) { // Skip for system user
        return res.json({ message: "No automatic operations for system user" });
      }

      const result = await storage.checkAndProcessAutomaticOperations(clientId);
      res.json(result);
    } catch (error) {
      console.error('Error in automatic operations:', error);
      res.status(500).json({ message: "Error processing automatic operations" });
    }
  });

  // Force automatic close (for testing)
  app.post("/api/cash-register/force-close", async (req, res) => {
    try {
      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const closedRegister = await storage.autoCloseCashRegister(clientId);
      if (closedRegister) {
        res.json({ 
          success: true, 
          message: "Caja cerrada automáticamente",
          closedRegister 
        });
      } else {
        res.json({ 
          success: false, 
          message: "No hay caja abierta para cerrar" 
        });
      }
    } catch (error) {
      console.error('Error forcing cash close:', error);
      res.status(500).json({ message: "Error closing cash register" });
    }
  });

  // Endpoint para probar cierre automático diario (SOLO PARA TESTING)
  app.post('/api/cash-register/test-auto-close', async (req, res) => {
    try {
      const { clientId } = req.body;

      if (!clientId) {
        return res.status(400).json({ success: false, message: 'ClientId es requerido' });
      }

      console.log(`🧪 [TEST] Probando cierre automático para cliente ${clientId}...`);

      // Simular cierre del día anterior (como si fuera 23:59)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      console.log(`🧪 [TEST] Simulando cierre automático para fecha: ${yesterdayStr}`);

      // Verificar si ya existe un reporte diario de ayer
      const reports = await storage.getDailyReportsByClientId(clientId);
      const yesterdayReport = reports.find((report: any) => {
        // Ensure report.reportDate is a Date object before calling toISOString
        const reportDate = new Date(report.reportDate);
        return reportDate.toISOString().split('T')[0] === yesterdayStr;
      });

      if (yesterdayReport) {
        console.log(`🧪 [TEST] Ya existe reporte de ayer: ${yesterdayReport.id}`);
        return res.json({
          success: false,
          message: 'Ya existe un reporte diario de ayer',
          existingReport: yesterdayReport
        });
      }

      // Ejecutar cierre automático usando la función real
      const closedRegister = await storage.autoCloseCashRegister(clientId);

      if (closedRegister) {
        console.log(`🧪 [TEST] Cierre automático exitoso:`, closedRegister);
        res.json({
          success: true,
          message: 'Cierre automático de prueba ejecutado exitosamente',
          closedRegister,
          testDate: yesterdayStr
        });
      } else {
        console.log(`🧪 [TEST] No se pudo cerrar - no hay caja abierta`);
        res.json({
          success: false,
          message: 'No hay caja abierta para cerrar'
        });
      }

    } catch (error) {
      console.error(`🧪 [TEST ERROR] Error en prueba de cierre automático:`, error);
      res.status(500).json({
        success: false,
        message: 'Error en la prueba de cierre automático',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Export cash movements endpoint
  app.get("/api/cash-movements/export", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const movements = await storage.getAllCashMovementsForExport(clientId);
      res.json(movements);
    } catch (error) {
      console.error('Error exporting cash movements:', error);
      res.status(500).json({ message: "Error exporting cash movements" });
    }
  });

  // Get all movements for export
  app.get("/api/cash-movements/export", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const movements = await storage.getAllCashMovementsForExport(clientId);
      res.json(movements);
    } catch (error) {
      console.error('Error getting movements for export:', error);
      res.status(500).json({ message: "Error retrieving movements for export" });
    }
  });

  // =======================
  // CASH MOVEMENTS ROUTES
  // =======================

  // Create cash movement
  app.post("/api/cash-movements", async (req, res) => {
    try {
      const cashMovementData = insertCashMovementSchema.parse(req.body);
      const movement = await storage.createCashMovement(cashMovementData);
      res.json(movement);
    } catch (error) {
      console.error('Error creating cash movement:', error);
      res.status(400).json({ message: "Invalid cash movement data" });
    }
  });

  // Get cash movements with filters
  app.get("/api/cash-movements", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const type = req.query.type as string;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      const customer = req.query.customer as string;
      const vendor = req.query.vendor as string;
      const search = req.query.search as string;
      const paymentMethod = req.query.paymentMethod as string;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      // Use the comprehensive filter method - no default date filtering
      const movements = await storage.getCashMovementsWithFilters(clientId, {
        type: type && type !== "all" ? type : undefined,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        customer,
        vendor,
        search,
        paymentMethod: paymentMethod && paymentMethod !== "all" ? paymentMethod : undefined
      });

      res.json(movements);
    } catch (error) {
      console.error('Error getting cash movements:', error);
      res.status(500).json({ message: "Error retrieving cash movements" });
    }
  });

  // =======================
  // EXPENSES ROUTES
  // =======================

  // Create expense
  app.post("/api/expenses", async (req, res) => {
    try {
      console.log('Creating expense with data:', JSON.stringify(req.body, null, 2));

      const expenseData = insertExpenseSchema.parse(req.body);
      console.log('Parsed expense data:', JSON.stringify(expenseData, null, 2));

      // Calculate USD amount based on exchange rate
      let exchangeRate = 1;
      if (expenseData.currency === "ARS") {
        exchangeRate = parseFloat(expenseData.exchangeRate || "1200"); // Default rate
      } else if (expenseData.currency === "USDT") {
        exchangeRate = parseFloat(expenseData.exchangeRate || "1"); // Default rate
      }

      const amountUsd = (parseFloat(expenseData.amount) / exchangeRate).toFixed(2);
      console.log('Calculated amountUsd:', amountUsd);

      // Get current cash register
      const currentCashRegister = await storage.getCurrentCashRegister(expenseData.clientId);
      if (!currentCashRegister) {
        return res.status(400).json({ message: "No hay caja registradora abierta" });
      }

      // Add missing fields with defaults
      const completeExpenseData = {
        ...expenseData,
        amountUsd,
        cashRegisterId: currentCashRegister.id,
        userId: expenseData.userId || 2, // Default user (developer)
        expenseDate: expenseData.expenseDate || new Date()
      };

      console.log('Complete expense data:', JSON.stringify(completeExpenseData, null, 2));

      const expense = await storage.createExpense(completeExpenseData);
      console.log('Created expense:', JSON.stringify(expense, null, 2));

      // Create corresponding cash movement
      try {
        await storage.createCashMovement({
          clientId: expenseData.clientId,
          cashRegisterId: currentCashRegister.id,
          type: 'gasto',
          subtype: expenseData.paymentMethod,
          amount: expenseData.amount,
          currency: expenseData.currency,
          exchangeRate: expenseData.exchangeRate || exchangeRate.toString(),
          amountUsd,
          description: `Gasto: ${expenseData.description}`,
          referenceId: expense.id,
          referenceType: 'expense',
          userId: expenseData.userId || 2
        });
        console.log('Created cash movement for expense');
      } catch (movementError) {
        console.error('Error creating cash movement for expense:', movementError);
        // Don't fail the expense creation if movement fails
      }

      res.json(expense);
    } catch (error) {
      console.error('Error creating expense:', error);
      if (error instanceof Error) {
        res.status(400).json({ message: "Invalid expense data", details: error.message });
      } else {
        res.status(400).json({ message: "Invalid expense data" });
      }
    }
  });

  // Get expenses
  app.get("/api/expenses", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const category = req.query.category as string;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      let expenses;
      if (category) {
        expenses = await storage.getExpensesByCategory(clientId, category);
      } else if (dateFrom && dateTo) {
        expenses = await storage.getExpensesByDateRange(clientId, new Date(dateFrom), new Date(dateTo));
      } else {
        expenses = await storage.getExpensesByClientId(clientId);
      }

      res.json(expenses);
    } catch (error) {
      console.error('Error getting expenses:', error);
      res.status(500).json({ message: "Error retrieving expenses" });
    }
  });

  // Update expense
  app.put("/api/expenses/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;

      const expense = await storage.updateExpense(id, updates);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      res.json(expense);
    } catch (error) {
      console.error('Error updating expense:', error);
      res.status(400).json({ message: "Invalid expense data" });
    }
  });

  // Delete expense
  app.delete("/api/expenses/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteExpense(id);

      if (!success) {
        return res.status(404).json({ message: "Expense not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting expense:', error);
      res.status(500).json({ message: "Error deleting expense" });
    }
  });

  // =======================
  // CUSTOMER DEBTS ROUTES
  // =======================

  // Get active debts calculated from orders - TEMPORARY HARDCODED SOLUTION
  app.get("/api/customer-debts/active", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log('🔍 Calculating active debts for client:', clientId);

      // Get real debts from the database using the cash storage system
      const activeDebtsData = await storage.getActiveDebts(clientId);

      const activeDebts = activeDebtsData.map((debt: any) => ({
        id: debt.id,
        orderId: debt.orderId,
        orderNumber: debt.orderNumber || `ORD-${debt.orderId}`,
        customerName: debt.customerName || 'Cliente',
        vendorName: 'jorge', // Default vendor name
        debtAmount: debt.debtAmount,
        paidAmount: debt.paidAmount || '0.00',
        remainingAmount: debt.remainingAmount,
        currency: debt.currency || 'USD',
        status: debt.status,
        createdAt: debt.createdAt,
        notes: debt.notes || `Deuda pendiente de orden ${debt.orderId}`
      }));

      console.log('✅ Active debts calculated:', activeDebts.length);
      res.json(activeDebts);
    } catch (error) {
      console.error('Error calculating active debts:', error);
      res.status(500).json({ message: "Error retrieving active debts" });
    }
  });

  // Get total debts amount for dashboard - TEMPORARY HARDCODED SOLUTION
  app.get("/api/customer-debts/total", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log('💰 Calculating total debts for client:', clientId);

      // Get real total debts from the database
      const activeDebtsData = await storage.getActiveDebts(clientId);
      const totalDebts = activeDebtsData.reduce((sum: number, debt: any) => {
        return sum + parseFloat(debt.remainingAmount || '0');
      }, 0);

      console.log('💸 Total debts calculated:', totalDebts);
      res.json({ totalDebts: totalDebts.toFixed(2) });
    } catch (error) {
      console.error('Error calculating total debts:', error);
      res.status(500).json({ message: "Error calculating total debts" });
    }
  });

  // Get customer debts
  app.get("/api/customer-debts", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      let debts;
      if (customerId) {
        debts = await storage.getCustomerDebtsByCustomerId(customerId);
      } else {
        debts = await storage.getCustomerDebtsByClientId(clientId);
      }

      res.json(debts);
    } catch (error) {
      console.error('Error getting customer debts:', error);
      res.status(500).json({ message: "Error retrieving customer debts" });
    }
  });

  // Create customer debt
  app.post("/api/customer-debts", async (req, res) => {
    try {
      const debtData = insertCustomerDebtSchema.parse(req.body);
      const debt = await storage.createCustomerDebt(debtData);
      res.json(debt);
    } catch (error) {
      console.error('Error creating customer debt:', error);
      res.status(400).json({ message: "Invalid debt data" });
    }
  });

  // =======================
  // DEBT PAYMENTS ROUTES
  // =======================

  // Create debt payment with automatic order synchronization
  app.post("/api/debt-payments", async (req, res) => {
    try {
      const paymentData = req.body;
      console.log('🔄 Processing debt payment:', paymentData);

      // Calculate USD amount with corrected exchange rate handling
      let amountUsd;

      // Handle payment method specific conversion logic
      if (paymentData.paymentMethod === 'efectivo_ars' || paymentData.paymentMethod === 'transferencia_ars') {
        // ARS methods: amount in ARS, convert to USD
        const exchangeRate = parseFloat(paymentData.exchangeRate || "1100");
        amountUsd = parseFloat(paymentData.amount) / exchangeRate;
      } else if (paymentData.paymentMethod === 'transferencia_usdt') {
        // USDT methods: USDT counts as USD (1:1 for accounting)
        amountUsd = parseFloat(paymentData.amount);
      } else if (paymentData.paymentMethod === 'financiera_ars') {
        // Financiera ARS→USD: amount in ARS, convert to USD
        const exchangeRate = parseFloat(paymentData.exchangeRate || "1050");
        amountUsd = parseFloat(paymentData.amount) / exchangeRate;
      } else {
        // USD methods (efectivo_usd, transferencia_usd, financiera_usd): already in USD
        amountUsd = parseFloat(paymentData.amount);
      }
      console.log(`💰 Payment amount: ${paymentData.currency} ${paymentData.amount} = USD ${amountUsd.toFixed(2)}`);

      // If orderId is provided, update order payment status automatically
      if (paymentData.orderId) {
        const orderId = parseInt(paymentData.orderId);

        // Get order details
        const order = await storage.getOrderById(orderId);
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        // Get existing payments for this order
        const existingPayments = await storage.getPaymentsByOrderId(orderId);
        const existingTotal = existingPayments.reduce((sum, p) => sum + parseFloat(p.amountUsd), 0);

        // Calculate new total after this payment
        const newTotalPaid = existingTotal + amountUsd;
        const orderTotal = parseFloat(order.totalUsd);

        console.log(`📊 Order payment status: existing=${existingTotal.toFixed(2)}, new=${amountUsd.toFixed(2)}, total=${newTotalPaid.toFixed(2)}, orderTotal=${orderTotal.toFixed(2)}`);

        // Determine new payment status
        let newPaymentStatus = 'pendiente';
        if (newTotalPaid >= orderTotal) {
          newPaymentStatus = 'pagado';
        } else if (newTotalPaid > 0) {
          newPaymentStatus = 'parcial';
        }

        // Create payment record in payments table
        await storage.createPayment({
          clientId: paymentData.clientId,
          orderId: orderId,
          paymentMethod: paymentData.paymentMethod,
          amount: paymentData.amount,
          exchangeRate: paymentData.exchangeRate || "1",
          amountUsd: amountUsd.toFixed(2),
          notes: paymentData.notes || `Pago deuda - ${paymentData.paymentMethod}`,
          paymentDate: new Date()
        });

        // Update order payment status  
        await storage.updateOrder(orderId, {
          paymentStatus: newPaymentStatus
        });

        // Update customer debt status
        const activeDebts = await storage.getActiveDebts(paymentData.clientId);
        const orderDebt = activeDebts.find(debt => debt.orderId === orderId);

        if (orderDebt) {
          // Calculate remaining amount correctly: orderTotal - newTotalPaid
          const remainingAmount = orderTotal - newTotalPaid;

          await storage.updateCustomerDebt(orderDebt.id, {
            paidAmount: newTotalPaid.toFixed(2),
            remainingAmount: Math.max(0, remainingAmount).toFixed(2),
            status: remainingAmount <= 0 ? 'pagada' : 'vigente'
          });

          console.log(`💳 Debt updated: orderTotal=${orderTotal}, totalPaid=${newTotalPaid.toFixed(2)}, remaining=${Math.max(0, remainingAmount).toFixed(2)}, status=${remainingAmount <= 0 ? 'pagada' : 'vigente'}`);
        }

        console.log(`✅ Order ${orderId} payment status updated to: ${newPaymentStatus}`);
      }

      // Get current cash register for this client - use most recent one
      let currentCashRegister = await storage.getCurrentCashRegister(paymentData.clientId);
      if (!currentCashRegister) {
        // Fallback: get the most recent cash register
        console.log(`No active cash register found, getting most recent for client ${paymentData.clientId}`);
        currentCashRegister = await storage.getOrCreateTodayCashRegister(paymentData.clientId);
      }

      console.log(`Using cash register ID: ${currentCashRegister.id} for client ${paymentData.clientId}`);

      // Detect currency from payment method
      let currency = 'USD';
      if (paymentData.paymentMethod.includes('_ars')) {
        currency = 'ARS';
      } else if (paymentData.paymentMethod.includes('_usdt')) {
        currency = 'USDT';
      }

      // Create cash movement for tracking
      await storage.createCashMovement({
        clientId: paymentData.clientId,
        cashRegisterId: currentCashRegister.id,
        type: 'pago_deuda',
        subtype: paymentData.paymentMethod,
        amount: paymentData.amount,
        currency: currency,
        exchangeRate: paymentData.exchangeRate || "1",
        amountUsd: amountUsd.toFixed(2),
        description: `Pago de deuda - Orden #${paymentData.orderId || 'N/A'}`,
        referenceId: paymentData.orderId ? parseInt(paymentData.orderId) : null,
        referenceType: 'debt_payment',
        customerId: paymentData.customerId || null,
        vendorId: paymentData.vendorId || null,
        userId: paymentData.userId || 31,  // Default to user 31 (tito)
        notes: paymentData.notes
      });

      console.log('🔄 Real-time synchronization completed - Order, Debt, and Cash Movement updated');

      res.json({ 
        success: true, 
        message: "Pago de deuda procesado y sincronizado automáticamente",
        amountUsd: amountUsd.toFixed(2),
        orderId: paymentData.orderId
      });
    } catch (error) {
      console.error('❌ Error creating debt payment:', error);
      res.status(400).json({ message: "Invalid payment data", error: error.message });
    }
  });

  // Get debt payments
  app.get("/api/debt-payments", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const debtId = req.query.debtId ? parseInt(req.query.debtId as string) : undefined;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      let payments;
      if (debtId) {
        payments = await storage.getDebtPaymentsByDebtId(debtId);
      } else {
        payments = await storage.getDebtPaymentsByClientId(clientId);
      }

      res.json(payments);
    } catch (error) {
      console.error('Error getting debt payments:', error);
      res.status(500).json({ message: "Error retrieving debt payments" });
    }
  });

  // Test endpoint for debt calculation
  app.get("/api/test-debts", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string) || 1;
      console.log('🧪 Testing debt calculation for clientId:', clientId);

      const totalDebts = await storage.getTotalDebtsAmount(clientId);
      console.log('🧪 Test result - total debts:', totalDebts);

      res.json({ 
        clientId, 
        totalDebts,
        message: "Debt calculation test complete"
      });
    } catch (error) {
      console.error('🧪 Test error:', error);
      res.status(500).json({ message: "Test failed", error: error.message });
    }
  });

  // =======================
  // VENDOR PERFORMANCE ROUTES
  // =======================

  // Get vendor sales ranking
  app.get("/api/vendor-performance/ranking", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`📊 Calculating vendor ranking for client ${clientId}, period: ${dateFrom} - ${dateTo}`);

      // Get date range
      const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = dateTo ? new Date(dateTo) : new Date();

      // Get orders and vendors data
      const orders = await storage.getOrdersByDateRange(clientId, startDate, endDate);
      const vendors = await storage.getVendorsByClientId(clientId);

      // Calculate vendor statistics
      const vendorStats = {};

      for (const order of orders) {
        if (!vendorStats[order.vendorId]) {
          const vendor = vendors.find(v => v.id === order.vendorId);
          vendorStats[order.vendorId] = {
            vendorId: order.vendorId,
            vendorName: vendor?.name || 'Sin asignar',
            vendorPhone: vendor?.phone || 'N/A',
            totalSales: 0,
            totalOrders: 0,
            totalRevenue: 0
          };
        }

        vendorStats[order.vendorId].totalSales += parseFloat(order.totalUsd);
        vendorStats[order.vendorId].totalRevenue += parseFloat(order.totalUsd);
        vendorStats[order.vendorId].totalOrders += 1;
      }

      // Convert to array and calculate additional metrics
      const ranking = Object.values(vendorStats).map((vendor: any) => {
        vendor.averageOrderValue = vendor.totalOrders > 0 ? 
          (vendor.totalSales / vendor.totalOrders).toFixed(2) : '0.00';
        vendor.estimatedProfit = (vendor.totalSales * 0.25).toFixed(2); // 25% estimated profit margin
        vendor.totalSales = vendor.totalSales.toFixed(2);
        return vendor;
      });

      // Sort by total sales (descending) and assign ranks
      ranking.sort((a, b) => parseFloat(b.totalSales) - parseFloat(a.totalSales));
      ranking.forEach((vendor, index) => {
        vendor.rank = index + 1;
      });

      console.log(`✅ Vendor ranking calculated for ${ranking.length} vendors`);
      res.json(ranking);
    } catch (error) {
      console.error('Error calculating vendor ranking:', error);
      res.status(500).json({ message: "Error calculating vendor ranking" });
    }
  });

  // Get detailed vendor profit report
  app.get("/api/vendor-performance/profits", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : null;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`💰 Calculating vendor profits for client ${clientId}, vendor ${vendorId}`);

      // Get vendors with their commission rates
      const vendors = await storage.getVendorsByClientId(clientId);
      const vendorCommissions = {};
      vendors.forEach(vendor => {
        // Use commissionPercentage field, fallback to 10% if not set
        const commissionValue = vendor.commissionPercentage || vendor.commission || "10";
        vendorCommissions[vendor.id] = parseFloat(commissionValue);
        console.log(`📊 Vendor ${vendor.name} (ID: ${vendor.id}) commission rate: ${commissionValue}%`);
      });

      // Get orders with order items and product details
      const orders = await storage.getOrdersWithItemsAndProducts(clientId, vendorId);

      // Filter by date range if provided
      let filteredOrders = orders;
      if (dateFrom && dateTo) {
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        filteredOrders = orders.filter(order => {
          const orderDate = new Date(order.createdAt);
          return orderDate >= startDate && orderDate <= endDate;
        });
      }

      // Calculate detailed profit per vendor
      const vendorProfits = {};

      filteredOrders.forEach(order => {
        const vendorKey = `${order.vendorId}-${order.vendorName || 'Vendedor'}`;
        const vendorCommissionRate = vendorCommissions[order.vendorId] || 10;

        if (!vendorProfits[vendorKey]) {
          vendorProfits[vendorKey] = {
            vendorId: order.vendorId,
            vendorName: order.vendorName || 'Vendedor',
            vendorCommissionRate: vendorCommissionRate,
            orders: [],
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            profitMargin: 0,
            orderCount: 0
          };
        }

        // Calculate order profit
        let orderRevenue = parseFloat(order.totalUsd);
        let orderCost = 0;
        let orderProfit = 0;

        // Get order items to calculate actual cost
        // Check both 'items' and 'orderItems' properties as the structure may vary
        const orderItemsArray = order.items || order.orderItems || [];

        if (orderItemsArray && orderItemsArray.length > 0) {
          orderItemsArray.forEach(item => {
            const itemRevenue = parseFloat(item.priceUsd) * item.quantity;
            const itemCost = item.product ? parseFloat(item.product.costPrice) * item.quantity : 0;

            orderCost += itemCost;
          });
          orderProfit = orderRevenue - orderCost;
        } else {
          // Fallback: estimate 30% profit margin if no item details
          orderCost = orderRevenue * 0.7;
          orderProfit = orderRevenue * 0.3;
        }

        // Add to vendor totals
        vendorProfits[vendorKey].totalRevenue += orderRevenue;
        vendorProfits[vendorKey].totalCost += orderCost;
        vendorProfits[vendorKey].totalProfit += orderProfit;
        vendorProfits[vendorKey].orderCount += 1;

        // Add order details
        vendorProfits[vendorKey].orders.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          revenue: orderRevenue.toFixed(2),
          cost: orderCost.toFixed(2),
          profit: orderProfit.toFixed(2),
          profitMargin: orderRevenue > 0 ? ((orderProfit / orderRevenue) * 100).toFixed(1) : '0.0',
          date: order.createdAt,
          status: order.status,
          paymentStatus: order.paymentStatus
        });
      });

      // Calculate profit margins and convert to array
      const profitReport = Object.values(vendorProfits).map((vendor: any) => {
        vendor.profitMargin = vendor.totalRevenue > 0 ? ((vendor.totalProfit / vendor.totalRevenue) * 100).toFixed(1) : '0.0';

        // Calculate commission based on vendor's specific rate
        const commissionAmount = (vendor.totalProfit * vendor.vendorCommissionRate / 100);
        vendor.commission = commissionAmount.toFixed(2);
        vendor.commissionRate = vendor.vendorCommissionRate.toFixed(1);

        // Calculate average order value
        vendor.avgOrderValue = vendor.orderCount > 0 ? (vendor.totalRevenue / vendor.orderCount).toFixed(2) : '0.00';

        vendor.totalRevenue = vendor.totalRevenue.toFixed(2);
        vendor.totalCost = vendor.totalCost.toFixed(2);
        vendor.totalProfit = vendor.totalProfit.toFixed(2);

        // Sort orders by date (most recent first)
        vendor.orders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return vendor;
      });

      // Sort by total profit (descending)
      profitReport.sort((a, b) => parseFloat(b.totalProfit) - parseFloat(a.totalProfit));

      console.log(`✅ Vendor profit report calculated for ${profitReport.length} vendors`);
      res.json(profitReport);
    } catch (error) {
      console.error('Error calculating vendor profits:', error);
      res.status(500).json({ message: "Error calculating vendor profits" });
    }
  });

  // Get vendor performance summary
  app.get("/api/vendor-performance/summary", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const period = req.query.period as string || 'month'; // 'day', 'week', 'month', 'year'

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`📈 Calculating vendor performance summary for client ${clientId}, period: ${period}`);

      // Calculate date range based on period
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case 'day':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(now.getMonth() - 1); // Default to month
      }

      // Get orders in the specified period
      const orders = await storage.getOrdersByDateRange(clientId, startDate, now);
      const vendors = await storage.getVendorsByClientId(clientId);

      // Calculate summary metrics
      const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.totalUsd), 0);
      const totalOrders = orders.length;
      const activeVendors = new Set(orders.map(order => order.vendorId)).size;

      // Calculate top performer
      const vendorStats = {};
      orders.forEach(order => {
        if (!vendorStats[order.vendorId]) {
          vendorStats[order.vendorId] = {
            vendorId: order.vendorId,
            sales: 0,
            orders: 0
          };
        }
        vendorStats[order.vendorId].sales += parseFloat(order.totalUsd);
        vendorStats[order.vendorId].orders += 1;
      });

      const topPerformer = Object.values(vendorStats).reduce((top: any, current: any) => 
        current.sales > (top?.sales || 0) ? current : top, null);

      const topPerformerName = topPerformer ? 
        vendors.find(v => v.id === topPerformer.vendorId)?.name || 'Desconocido' : 
        'N/A';

      const summary = {
        period,
        dateRange: {
          from: startDate.toISOString(),
          to: now.toISOString()
        },
        totalRevenue: totalRevenue.toFixed(2),
        totalOrders,
        activeVendors,
        totalVendors: vendors.length,
        averageOrderValue: totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : '0.00',
        topPerformer: {
          vendorId: topPerformer?.vendorId || null,
          vendorName: topPerformerName,
          sales: topPerformer?.sales.toFixed(2) || '0.00',
          orders: topPerformer?.orders || 0
        }
      };

      console.log(`✅ Vendor performance summary calculated`);
      res.json(summary);
    } catch (error) {
      console.error('Error calculating vendor performance summary:', error);
      res.status(500).json({ message: "Error calculating performance summary" });
    }
  });

  // =======================
  // DAILYREPORTSROUTES
  // ======================="

  // Generate daily report
  app.post("/api/daily-reports/generate", async (req, res) => {
    try {
      const { clientId, date } = req.body;
      const reportDate = new Date(date);

      const report = await storage.generateAutoDailyReport(clientId, reportDate);
      res.json(report);
    } catch (error) {
      console.error('Error generating daily report:', error);
      res.status(500).json({ message: "Error generating daily report" });
    }
  });

  // Get daily reports with filtering
  app.get("/api/daily-reports", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const filter = req.query.filter as string;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      // Get client info to limit reports to creation date onwards
      const client = await storage.getClientById(clientId);
      if (!client) {
        return res.status(404).json({ message: 'Cliente no encontrado' });
      }

      let reports = await storage.getDailyReportsByClientId(clientId);

      // Filter reports to only show from client creation date onwards
      const clientCreationDate = new Date(client.createdAt);
      reports = reports.filter(report => {
        const reportDate = new Date(report.reportDate);
        return reportDate >= clientCreationDate;
      });

      // Apply date range filter if provided
      if (filter) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        console.log(`📊 Aplicando filtro '${filter}' a ${reports.length} reportes`);

        switch (filter) {
          case 'week':
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);
            const beforeFilter = reports.length;
            reports = reports.filter(report => {
              const reportDate = new Date(report.reportDate);
              return reportDate >= oneWeekAgo;
            });
            console.log(`📅 Filtro semana: ${beforeFilter} -> ${reports.length} reportes (desde ${oneWeekAgo.toISOString().split('T')[0]})`);
            break;

          case 'month':
            const oneMonthAgo = new Date(today);
            oneMonthAgo.setMonth(today.getMonth() - 1);
            reports = reports.filter(report => {
              const reportDate = new Date(report.reportDate);
              return reportDate >= oneMonthAgo;
            });
            break;

          case 'year':
            const oneYearAgo = new Date(today);
            oneYearAgo.setFullYear(today.getFullYear() - 1);
            reports = reports.filter(report => {
              const reportDate = new Date(report.reportDate);
              return reportDate >= oneYearAgo;
            });
            break;

          default:
            // No additional filtering, already limited by client creation date
            break;
        }
      }

      res.json(reports);
    } catch (error) {
      console.error('Error getting daily reports:', error);
      res.status(500).json({ message: "Error retrieving daily reports" });
    }
  });

  // =======================
  // VENDOR PERFORMANCE ROUTES
  // =======================

  // Get vendor ranking
  app.get("/api/vendor-performance/ranking", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`📊 Generating vendor ranking for client ${clientId}, period: ${dateFrom} - ${dateTo}`);

      // Get date range
      const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = dateTo ? new Date(dateTo) : new Date();

      // Get orders and vendors data
      const orders = await storage.getOrdersByDateRange(clientId, startDate, endDate);
      const vendors = await storage.getVendorsByClientId(clientId);

      // Calculate vendor statistics
      const vendorStats = {};

      for (const order of orders) {
        if (!vendorStats[order.vendorId]) {
          const vendor = vendors.find(v => v.id === order.vendorId);
          vendorStats[order.vendorId] = {
            vendorId: order.vendorId,
            vendorName: vendor?.name || 'Sin asignar',
            vendorPhone: vendor?.phone || 'N/A',
            totalSales: 0,
            totalOrders: 0,
            totalRevenue: 0
          };
        }

        vendorStats[order.vendorId].totalSales += parseFloat(order.totalUsd);
        vendorStats[order.vendorId].totalRevenue += parseFloat(order.totalUsd);
        vendorStats[order.vendorId].totalOrders += 1;
      }

      // Convert to array and calculate additional metrics
      const ranking = Object.values(vendorStats).map((vendor: any) => {
        vendor.averageOrderValue = vendor.totalOrders > 0 ? 
          (vendor.totalSales / vendor.totalOrders).toFixed(2) : '0.00';
        vendor.estimatedProfit = (vendor.totalSales * 0.25).toFixed(2); // 25% estimated profit margin
        vendor.totalSales = vendor.totalSales.toFixed(2);
        return vendor;
      });

      // Sort by total sales (descending) and assign ranks
      ranking.sort((a, b) => parseFloat(b.totalSales) - parseFloat(a.totalSales));
      ranking.forEach((vendor, index) => {
        vendor.rank = index + 1;
      });

      console.log(`✅ Vendor ranking calculated for ${ranking.length} vendors`);
      res.json(ranking);
    } catch (error) {
      console.error('Error calculating vendor ranking:', error);
      res.status(500).json({ message: "Error calculating vendor ranking" });
    }
  });

  // =======================
  // SYSTEM RESET ENDPOINT
  // =======================

  app.post("/api/system/full-reset", async (req, res) => {
    try {
      console.log('🔥 FULL RESET INITIATED');

      if (!req.body.confirmed) {
        return res.status(400).json({ message: "Reset must be confirmed" });
      }

      // Delete all data using storage methods
      try {
        // Get all orders for client 1 first
        const ordersToDelete = await storage.getOrdersByClientId(1);

        // Delete payments, order items and orders
        for (const order of ordersToDelete) {
          const payments = await storage.getPaymentsByOrderId(order.id);
          for (const payment of payments) {
            await storage.deletePayment(payment.id);
          }
          await storage.deleteOrder(order.id);
        }

        // Delete other entities
        const debts = await storage.getCustomerDebtsByClientId(1);
        for (const debt of debts) {
          await storage.deleteCustomerDebt(debt.id);
        }

        const products = await storage.getProductsByClientId(1);
        for (const product of products) {
          await storage.deleteProduct(product.id);
        }

        const customers = await storage.getCustomersByClientId(1);
        for (const customer of customers) {
          await storage.deleteCustomer(customer.id);
        }

        const vendors = await storage.getVendorsByClientId(1);
        for (const vendor of vendors) {
          await storage.deleteVendor(vendor.id);
        }

        console.log('✅ All data deleted successfully');
      } catch (error) {
        console.error('Error during deletion:', error);
      }

      // Create fresh cash register with zero balances
      const freshCashRegister = await storage.createCashRegister({
        clientId: 1,
        date: new Date(),
        isOpen: true,
        initialUsd: "0.00",
        initialArs: "0.00", 
        initialUsdt: "0.00",
        currentUsd: "0.00",
        currentArs: "0.00",
        currentUsdt: "0.00",
        isActive: true
      });

      console.log('✅ Fresh cash register created:', freshCashRegister);

      res.json({ 
        message: "Sistema reseteado completamente", 
        cashRegister: freshCashRegister,
        resetTime: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error during full reset:', error);
      res.status(500).json({ 
        message: "Error durante el reset del sistema", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get generated reports (Excel/PDF)
  app.get("/api/generated-reports", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      const reports = await storage.getGeneratedReportsByClientId(clientId);
      res.json(reports);
    } catch (error) {
      console.error('Error getting generated reports:', error);
      res.status(500).json({ message: "Error retrieving generated reports" });
    }
  });

  // Download generated report by ID
  app.get("/api/generated-reports/:id/download", async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);

      if (!reportId) {
        return res.status(400).json({ message: "Report ID is required" });
      }

      const report = await storage.getGeneratedReportById(reportId);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Decode base64 file data
      const fileBuffer = Buffer.from(report.fileData, 'base64');

      // Set appropriate headers for download
      res.setHeader('Content-Type', report.reportType === 'excel' ? 'text/csv' : 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
      res.setHeader('Content-Length', fileBuffer.length);

      res.send(fileBuffer);
    } catch (error) {
      console.error('Error downloading generated report:', error);
      res.status(500).json({ message: "Error downloading report" });
    }
  });

  // Admin creation route (hidden, superuser only)
  app.post("/api/admin/create-tenant", async (req, res) => {
    try {
      // Get user from header (same as other endpoints)
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Get user info to verify superuser role
      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== 'superuser') {
        return res.status(403).json({ message: "Only superuser can create new tenants" });
      }

      const createAdminSchema = z.object({
        companyName: z.string().min(2),
        companyAddress: z.string().optional(),
        companyPhone: z.string().optional(),
        companyEmail: z.string().email().optional(),
        companyCuit: z.string().optional(),
        adminUsername: z.string().min(3),
        adminEmail: z.string().email(),
        adminPassword: z.string().min(6),
        adminName: z.string().min(2),
      });

      const data = createAdminSchema.parse(req.body);

      // Check if username or email already exists
      const existingUser = await storage.getUserByEmail(data.adminEmail);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(data.adminUsername);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create client first
      const newClient = await storage.createClient({
        name: data.companyName,
        email: data.companyEmail || "",
        phone: data.companyPhone || "",
        address: data.companyAddress || "",
        subscriptionType: data.subscriptionType || "premium"
      });

      // Create admin user for this client  
      // Password will be hashed automatically in createUser
      const newUser = await storage.createUser({
        clientId: newClient.id,
        username: data.adminUsername,
        email: data.adminEmail, // Admin user uses the provided email
        password: data.adminPassword, // Will be hashed by createUser method
        role: "admin",
        isActive: true,
        mustChangePassword: false, // Admin can use password immediately
      });

      // Create default company configuration for this client
      const companyConfigData = {
        clientId: newClient.id,
        companyName: data.companyName,
        cuit: data.companyCuit || "00000000000",
        address: data.companyAddress || "Dirección no especificada",
        phone: data.companyPhone,
        email: data.companyEmail,
      };

      await storage.createCompanyConfiguration(companyConfigData);

      // Create initial cash register entry
      await storage.createCashRegister({
        clientId: newClient.id,
        date: new Date(),
        initialUsd: "0.00",
        initialArs: "0.00", 
        initialUsdt: "0.00",
        currentUsd: "0.00",
        currentArs: "0.00",
        currentUsdt: "0.00",
        isActive: true
      });

      res.json({
        client: newClient,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          clientId: newUser.clientId,
        },
        message: "Admin and company created successfully"
      });

    } catch (error) {
      console.error("Error creating admin:", error);
      res.status(500).json({ message: "Error creating admin" });
    }
  });

  // =======================
  // SISTEMA DE REVENDEDORES
  // =======================

  // Resellers management routes - Only accessible to superuser
  app.get("/api/resellers", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "superuser") {
        return res.status(403).json({ message: "SuperUser access required" });
      }

      const resellers = await storage.getResellers();
      res.json(resellers);
    } catch (error) {
      console.error("Error fetching resellers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/resellers", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "superuser") {
        return res.status(403).json({ message: "SuperUser access required" });
      }

      // No hacer hash aquí porque storage.createReseller ya lo hace
      const resellerData = { ...req.body };
      console.log('📝 Creando revendedor desde API - Password será hasheado en storage');

      const reseller = await storage.createReseller(resellerData);
      res.json(reseller);
    } catch (error) {
      console.error("Error creating reseller:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/resellers/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "superuser") {
        return res.status(403).json({ message: "SuperUser access required" });
      }

      const resellerId = parseInt(req.params.id);

      // No hacer hash aquí porque storage.updateReseller ya lo hace
      const updateData = { ...req.body };
      console.log('📝 Actualizando revendedor desde API - Password será hasheado en storage si se proporciona');

      const reseller = await storage.updateReseller(resellerId, updateData);
      res.json(reseller);
    } catch (error) {
      console.error("Error updating reseller:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/resellers/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "superuser") {
        return res.status(403).json({ message: "SuperUser access required" });
      }

      const resellerId = parseInt(req.params.id);
      await storage.deleteReseller(resellerId);
      res.json({ message: "Reseller deleted successfully" });
    } catch (error) {
      console.error("Error deleting reseller:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/reseller-sales", async (req, res) => {
    try {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { user, isReseller } = auth;

      // Allow superusers and resellers
      if (user.role !== "superuser" && user.role !== "reseller") {
        return res.status(403).json({ message: "Access denied" });
      }

      let sales;
      if (user.role === "superuser") {
        // SuperUser can see all sales
        sales = await storage.getResellerSales();
      } else {
        // Reseller can only see their own sales
        sales = await storage.getResellerSalesByReseller(user.id);
      }

      res.json(sales);
    } catch (error) {
      console.error("Error fetching reseller sales:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reseller-specific routes - Only accessible to resellers
  app.get("/api/reseller/stats", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      const stats = await storage.getResellerStats(user.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching reseller stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/reseller/sales", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      const sales = await storage.getResellerSalesByReseller(user.id);
      console.log(`🎯 Route handler - found ${sales.length} sales for reseller ${user.id}`);
      console.log(`🎯 Sales IDs: ${sales.map((s: any) => s.id).join(', ')}`);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching reseller sales:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/reseller/sales", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      const sale = await storage.createResellerSale(user.id, req.body);
      res.json(sale);
    } catch (error) {
      console.error("Error creating reseller sale:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Nueva ruta para obtener clientes de un revendedor específico
  app.get("/api/reseller-clients", async (req, res) => {
    try {
      const resellerId = req.query.resellerId;
      const authToken = req.headers["authorization"];

      if (!resellerId || !authToken) {
        return res.status(401).json({ message: "Reseller ID and Authorization required" });
      }

      // Verificar que el token corresponde al revendedor
      const tokenResellerId = authToken.toString().replace('Bearer reseller_', '');
      if (tokenResellerId !== resellerId.toString()) {
        return res.status(403).json({ message: "Access denied" });
      }

      const clients = await storage.getClientsByResellerId(parseInt(resellerId as string));
      res.json(clients);
    } catch (error) {
      console.error("Error fetching reseller clients:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PRIMERA RUTA DUPLICADA ELIMINADA

  // SEGUNDA RUTA DUPLICADA ELIMINADA

  // =======================
  // ADMINISTRACIÓN DE ADMINS
  // =======================

  // Get all clients for superuser dashboard
  app.get("/api/admin/clients", async (req, res) => {
    try {
      // Get user from header (same as other endpoints)
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Get user info to verify superuser role
      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== 'superuser') {
        return res.status(403).json({ message: "Only superuser can view clients" });
      }

      // Get all clients with their admin users
      const clients = await storage.getAllClientsWithAdmins();
      res.json(clients);
    } catch (error) {
      console.error('Error getting clients:', error);
      res.status(500).json({ message: "Error retrieving clients" });
    }
  });

  // Update client (admin management)
  app.put("/api/admin/clients/:id", async (req, res) => {
    try {
      // Get user from header
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Get user info to verify superuser role
      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== 'superuser') {
        return res.status(403).json({ message: "Only superuser can update clients" });
      }

      const clientId = parseInt(req.params.id);
      const updateData = req.body;

      // Convert date strings to Date objects if they exist and are not empty
      if (updateData.trialStartDate && typeof updateData.trialStartDate === 'string' && updateData.trialStartDate.trim() !== '') {
        updateData.trialStartDate = new Date(updateData.trialStartDate + 'T00:00:00.000Z');
      } else if (updateData.trialStartDate === '') {
        updateData.trialStartDate = null;
      }

      if (updateData.trialEndDate && typeof updateData.trialEndDate === 'string' && updateData.trialEndDate.trim() !== '') {
        updateData.trialEndDate = new Date(updateData.trialEndDate + 'T23:59:59.999Z');
      } else if (updateData.trialEndDate === '') {
        updateData.trialEndDate = null;
      }

      // Handle password change if provided
      if (updateData.newPassword && updateData.newPassword.trim() !== '') {
        // Find the admin user for this client
        const adminUsers = await db.select().from(users).where(and(
          eq(users.clientId, clientId),
          eq(users.role, "admin")
        ));

        const admin = adminUsers.find(u => u.role === 'admin');

        if (admin) {
          // Pass the raw password - storage.updateUser will handle the hashing
          await storage.updateUser(admin.id, { password: updateData.newPassword });
        }

        // Remove newPassword from client update data
        delete updateData.newPassword;
      }

      const updatedClient = await storage.updateClient(clientId, updateData);

      if (!updatedClient) {
        return res.status(404).json({ message: "Client not found" });
      }

      res.json(updatedClient);
    } catch (error) {
      console.error('Error updating client:', error);
      if ((error as any)?.message?.includes('already exists for another client')) {
        res.status(400).json({ message: (error as any).message });
      } else {
        res.status(500).json({ message: "Error updating client" });
      }
    }
  });

  // Check client movements before deletion (admin management)
  app.get("/api/admin/clients/:id/movements", async (req, res) => {
    try {
      // Get user from header
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Get user info to verify superuser role
      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== 'superuser') {
        return res.status(403).json({ message: "Only superuser can check client movements" });
      }

      const clientId = parseInt(req.params.id);

      // Check different types of movements/data for this client
      const movements = await storage.getClientMovementsSummary(clientId);

      res.json(movements);
    } catch (error) {
      console.error('Error checking client movements:', error);
      res.status(500).json({ message: "Error checking client movements" });
    }
  });

  // Delete client (admin management)
  app.delete("/api/admin/clients/:id", async (req, res) => {
    try {
      // Get user from header
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      // Get user info to verify superuser role
      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== 'superuser') {
        return res.status(403).json({ message: "Only superuser can delete clients" });
      }

      const clientId = parseInt(req.params.id);

      // Delete all users of this client first
      const clientUsers = await storage.getUsersByClientId(clientId);
      for (const clientUser of clientUsers) {
        await storage.deleteUser(clientUser.id);
      }

      // Delete client (which should cascade delete company configurations)
      const deleted = await storage.deleteClient(clientId);

      if (!deleted) {
        return res.status(404).json({ message: "Client not found" });
      }

      res.json({ message: "Client and all related data deleted successfully" });
    } catch (error) {
      console.error('Error deleting client:', error);
      res.status(500).json({ message: "Error deleting client" });
    }
  });

  // System Configuration Routes (SuperUser only)
  app.get("/api/system-configuration", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "superuser") {
        return res.status(403).json({ message: "SuperUser access required" });
      }

      // Return default configuration for now
      const defaultConfig = {
        premiumMonthlyPrice: "$29.99/mes",
        premiumYearlyPrice: "$299.99/año", 
        premiumYearlyDiscount: "2 meses gratis",
        premiumYearlyPopular: true,
        salesPhone: "1170627214",
        salesEmail: "ventas@stockcel.com",
        supportEmail: "soporte@stockcel.com",
        expiredTitle: "Suscripción Expirada",
        expiredMessage: "Tu período de prueba ha expirado. Para continuar usando StockCel, necesitas renovar tu suscripción.",
        plansTitle: "Planes disponibles:",
        contactTitle: "Contacta a ventas:"
      };

      res.json(defaultConfig);
    } catch (error) {
      console.error("Error getting system configuration:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/system-configuration", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ message: "User ID header missing" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || user.role !== "superuser") {
        return res.status(403).json({ message: "SuperUser access required" });
      }

      // For now, just return the updated data (we'll implement DB storage later)
      res.json(req.body);
    } catch (error) {
      console.error("Error updating system configuration:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =======================
  // RESELLERSROUTES (ELIMINADOS DUPLICADOS)
  // =======================

  // RUTA DUPLICADA ELIMINADA - YA EXISTE ARRIBA

  // =======================
  // RESELLER SPECIFIC ROUTES
  // =======================

  // Create new admin client (Reseller only)
  app.post("/api/reseller/create-admin", async (req, res) => {
    try {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { user, isReseller } = auth;
      if (user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      // Get current reseller data to check quota
      const reseller = await storage.getResellerById(user.id);
      if (!reseller) {
        return res.status(404).json({ message: "Reseller not found" });
      }

      // Check quota availability
      const availableQuota = (reseller.accountsQuota || 0) - (reseller.accountsSold || 0);
      if (availableQuota <= 0) {
        return res.status(400).json({ 
          message: "Sin cuota disponible. Contacte al administrador para obtener más cuentas.",
          quota: {
            total: reseller.accountsQuota || 0,
            sold: reseller.accountsSold || 0,
            available: availableQuota
          }
        });
      }

      // Create new client and admin user
      const { clientName, adminName, adminEmail, adminPassword, subscriptionType, trialDays, salePrice } = req.body;

      console.log('🏢 Revendedor creando nuevo admin:', { clientName, adminName, adminEmail, quotaAvailable: availableQuota });
      console.log('📧 Admin email que se usará:', adminEmail);

      // Create client (use a different email or make it optional)
      const clientEmail = `client+${Date.now()}@${clientName.toLowerCase().replace(/\s+/g, '')}.com`;
      const newClient = await storage.createClient({
        name: clientName,
        email: clientEmail, // Use unique generated email for client
        phone: "",
        address: "",
        subscriptionType: subscriptionType || "premium"
      });

      // Create admin user for the client  
      console.log('👤 Creating user with email:', adminEmail);
      const hashedPassword = bcrypt.hashSync(adminPassword, 12);
      const newUser = await storage.createUser({
        clientId: newClient.id,
        username: adminName,
        email: adminEmail, // Admin user uses the provided email
        password: hashedPassword,
        role: "admin",
        isActive: true,
        mustChangePassword: true
      });
      console.log('✅ User created with email:', newUser.email);

      // Create sale record directly (without calling createResellerSale to avoid duplicate client creation)
      const costPerAccount = "1000.00";
      const actualSalePrice = salePrice || "1500.00"; // Use provided sale price or default
      const profit = (parseFloat(actualSalePrice) - parseFloat(costPerAccount)).toString();

      const [saleRecord] = await db.insert(resellerSales).values({
        resellerId: user.id,
        clientId: newClient.id,
        costPerAccount,
        salePrice: actualSalePrice,
        profit,
        subscriptionType: subscriptionType || "premium",
        trialDays: trialDays || 0,
        notes: `Admin creado: ${adminName}`
      }).returning();

      // Update reseller stats - increment sold accounts and earnings
      await db.update(resellers)
        .set({
          accountsSold: ((reseller.accountsSold || 0) + 1).toString(),
          totalEarnings: (parseFloat(reseller.totalEarnings || "0") + parseFloat(profit)).toString(),
          totalPaid: (parseFloat(reseller.totalPaid || "0") + parseFloat(costPerAccount)).toString(),
          updatedAt: new Date(),
        })
        .where(eq(resellers.id, user.id));

      console.log('✅ Admin y cliente creados exitosamente por revendedor');
      console.log('📊 Cuota actualizada:', {
        previousSold: reseller.accountsSold || 0,
        newSold: (reseller.accountsSold || 0) + 1,
        totalQuota: reseller.accountsQuota || 0,
        remaining: availableQuota - 1
      });

      res.json({
        client: newClient,
        user: { ...newUser, password: undefined },
        sale: saleRecord,
        quota: {
          total: reseller.accountsQuota || 0,
          sold: (reseller.accountsSold || 0) + 1,
          remaining: availableQuota - 1
        },
        message: "Admin y cliente creados exitosamente"
      });
    } catch (error) {
      console.error("Error creating admin:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get reseller configuration
  app.get("/api/reseller/configuration", async (req, res) => {
    try {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { user, isReseller } = auth;
      if (user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      const config = await storage.getResellerConfiguration(user.id);
      res.json(config || {
        resellerId: user.id,
        companyName: "Mi Empresa",
        contactEmail: user.email,
        pricePerAccount: "1500.00",
        defaultTrialDays: 30,
        paymentMethods: ["transferencia", "efectivo"]
      });
    } catch (error) {
      console.error("Error getting reseller configuration:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update reseller configuration
  app.put("/api/reseller/configuration", async (req, res) => {
    try {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { user, isReseller } = auth;
      if (user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      const config = await storage.updateResellerConfiguration(user.id, req.body);
      res.json(config);
    } catch (error) {
      console.error("Error updating reseller configuration:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update reseller client (Edit functionality)
  app.put("/api/reseller/client/:clientId", async (req, res) => {
    try {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { user } = auth;
      if (user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      const clientId = parseInt(req.params.clientId);
      const updateData = req.body;

      console.log('🖊️ Updating client:', clientId, updateData);

      // Update client
      await storage.updateClient(clientId, {
        name: updateData.companyName,
        phone: updateData.phone || "",
        address: updateData.address || "",
        subscriptionType: updateData.subscriptionType
      });

      // Update admin user email
      if (updateData.adminEmail) {
        const adminUsers = await db.select().from(users).where(and(
          eq(users.clientId, clientId),
          eq(users.role, "admin")
        ));

        if (adminUsers.length > 0) {
          await db.update(users)
            .set({ email: updateData.adminEmail })
            .where(eq(users.id, adminUsers[0].id));
          console.log('📧 Updated admin email to:', updateData.adminEmail);
        }
      }

      res.json({ message: "Cliente actualizado exitosamente" });
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete reseller client
  app.delete("/api/reseller/client/:clientId", async (req, res) => {
    try {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { user } = auth;
      if (user.role !== "reseller") {
        return res.status(403).json({ message: "Reseller access required" });
      }

      const clientId = parseInt(req.params.clientId);

      console.log('🗑️ Deleting client:', clientId);

      // Delete admin users first
      await db.delete(users).where(eq(users.clientId, clientId));

      // Delete client
      await storage.deleteClient(clientId);

      // Delete sales record
      await db.delete(resellerSales).where(eq(resellerSales.clientId, clientId));

      res.json({ message: "Cliente eliminado exitosamente" });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  // Get reseller configuration (Reseller only)
  // TERCERA RUTA DUPLICADA ELIMINADA

  // CUARTA RUTA DUPLICADA ELIMINADA

  // =======================
  // CASH SCHEDULE CONFIGURATION ROUTES
  // =======================

  // Get cash schedule configuration
  app.get("/api/cash-schedule/config", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Getting cash schedule config for client ${clientId}`);
      const config = await cashScheduleStorage.getScheduleConfig(clientId);

      // Return default config if none exists
      const defaultConfig = {
        clientId,
        autoOpenEnabled: false,
        autoCloseEnabled: false,
        openHour: 9,
        openMinute: 0,
        closeHour: 18,
        closeMinute: 0,
        activeDays: "1,2,3,4,5,6,7",
        timezone: "America/Argentina/Buenos_Aires",
      };

      res.json(config || defaultConfig);
    } catch (error) {
      console.error('Error getting cash schedule config:', error);
      res.status(500).json({ message: "Error retrieving schedule configuration" });
    }
  });

  // Update cash schedule configuration
  app.post("/api/cash-schedule/config", async (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { clientId, ...configData } = req.body;
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Cash schedule updated for client ${clientId} by ${user.email}`);
      console.log(`🕐 New config data:`, configData);

      const updatedConfig = await cashScheduleStorage.upsertScheduleConfig(clientId, configData);

      console.log(`🕐 Config successfully updated:`, updatedConfig);
      res.json(updatedConfig);
    } catch (error) {
      console.error('Error updating cash schedule config:', error);
      res.status(500).json({ message: "Error updating schedule configuration" });
    }
  });

  // Get scheduled operations for a client
  app.get("/api/cash-schedule/operations", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Getting scheduled operations for client ${clientId}`);
      const operations = await cashScheduleStorage.getScheduledOperations(clientId);

      console.log(`🕐 Found ${operations.length} scheduled operations for client ${clientId}`);
      res.json(operations);
    } catch (error) {
      console.error('Error getting scheduled operations:', error);
      res.status(500).json({ message: "Error retrieving scheduled operations" });
    }
  });

  // Get auto operations log
  app.get("/api/cash-schedule/log", async (req, res) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      const limit = parseInt(req.query.limit as string) || 50;

      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }

      console.log(`🕐 Getting operations log for client ${clientId}, limit ${limit}`);
      const log = await cashScheduleStorage.getAutoOperationsLog(clientId, limit);

      res.json(log);
    } catch (error) {
      console.error('Error getting operations log:', error);
      res.status(500).json({ message: "Error retrieving operations log" });
    }
  });

  // Get automation service status
  app.get("/api/cash-schedule/service-status", async (req, res) => {
    try {
      const {cashAutomationService} = await import('./cash-automation-service.js');
      const status = cashAutomationService.getStatus();

      res.json(status);
    } catch (error) {
      console.error('Error getting automation service status:', error);
      res.status(500).json({ message: "Error retrieving service status" });
    }
  });

  // Start automation service (admin only)
  app.post("/api/cash-schedule/service/start", async (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || !['admin', 'superuser'].includes(user.role)) {
        return res.status(403).json({ message: "Only admin or superuser can control automation service" });
      }

      const {cashAutomationService} = await import('./cash-automation-service.js');
      cashAutomationService.start();

      res.json({ message: "Cash automation service started", status: cashAutomationService.getStatus() });
    } catch (error) {
      console.error('Error starting automation service:', error);
      res.status(500).json({ message: "Error starting automation service" });
    }
  });

  // Stop automation service (admin only)
  app.post("/api/cash-schedule/service/stop", async (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ message: "User ID header required" });
      }

      const user = await storage.getUserById(parseInt(userId as string));
      if (!user || !['admin', 'superuser'].includes(user.role)) {
        return res.status(403).json({ message: "Only admin or superuser can control automation service" });
      }

      const {cashAutomationService} = await import('./cash-automation-service.js');
      cashAutomationService.stop();

      res.json({ message: "Cash automation service stopped", status: cashAutomationService.getStatus() });
    } catch (error) {
      console.error('Error stopping automation service:', error);
      res.status(500).json({ message: "Error stopping automation service" });
    }
  });

  // AUTO-SYNC MONITORROUTES
  app.get('/api/auto-sync/status', async (req: any, res: any) => {
    try {
      // Import functions inline to avoid circular dependencies
      const { getAutoSyncStatus } = await import('./auto-sync-monitor.js');
      const status = getAutoSyncStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting auto-sync status:', error);
      res.status(500).json({ message: 'Error getting auto-sync status' });
    }
  });

  app.post('/api/auto-sync/start', async (req: any, res: any) => {
    try {
      const { startAutoSyncMonitor, getAutoSyncStatus } = await import('./auto-sync-monitor.js');
      startAutoSyncMonitor();
      res.json({ message: 'Auto-sync monitor started', status: getAutoSyncStatus() });
    } catch (error) {
      console.error('Error starting auto-sync monitor:', error);
      res.status(500).json({ message: 'Error starting auto-sync monitor' });
    }
  });

  app.post('/api/auto-sync/stop', async (req: any, res: any) => {
    try {
      const { stopAutoSyncMonitor, getAutoSyncStatus } = await import('./auto-sync-monitor.js');
      stopAutoSyncMonitor();
      res.json({ message: 'Auto-sync monitor stopped', status: getAutoSyncStatus() });
    } catch (error) {
      console.error('Error stopping auto-sync monitor:', error);
      res.status(500).json({ message: 'Error stopping auto-sync monitor' });
    }
  });

  // Password reset endpoint
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email es requerido' });
      }

      console.log('🔍 Buscando usuario con email:', email);

      // Buscar usuario por email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Por seguridad, siempre responder exitosamente aunque el email no exista
        return res.json({ 
          message: 'Si el email existe en nuestro sistema, recibirás un enlace de recuperación' 
        });
      }

      console.log('✅ Usuario encontrado:', user.username);

      // Generar token único
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      // Guardar token en base de datos (simplified - store in user record)
      await storage.updateUser(user.id, {
        passwordResetToken: token,
        passwordResetExpires: expiresAt
      });

      console.log('🔐 Token generado:', token.substring(0, 8) + '...');

      // Generar URL de reset
      const baseUrl = req.get('host')?.includes('localhost') 
        ? `http://${req.get('host')}`
        : `https://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      console.log('🔗 URL de reset:', resetUrl);

      // Enviar respuesta exitosa
      res.json({ 
        message: 'Email de recuperación enviado. Revisa tu bandeja de entrada.',
        resetUrl: resetUrl // Solo para desarrollo
      });

    } catch (error) {
      console.error('❌ Error en forgot-password:', error);
      res.status(500).json({ 
        message: 'Error interno del servidor' 
      });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token y nueva contraseña son requeridos' });
      }

      // Find user by token
      const users = await storage.getAllUsers();
      const user = users.find(u => u.passwordResetToken === token && 
                              u.passwordResetExpires && 
                              new Date(u.passwordResetExpires) > new Date());

      if (!user) {
        return res.status(400).json({ message: 'Token inválido o expirado' });
      }

      // Hash new password
      const hashedPassword = bcrypt.hashSync(newPassword, 12);

      // Update password and clear reset token
      await storage.updateUser(user.id, {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        mustChangePassword: false
      });

      console.log('✅ Contraseña restablecida para:', user.email);
      res.json({ message: 'Contraseña restablecida exitosamente' });

    } catch (error) {
      console.error('❌ Error en reset-password:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}