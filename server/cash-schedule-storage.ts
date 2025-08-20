import { db } from "./storage";
import { eq, and } from "drizzle-orm";
import { pgTable, serial, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";

// Esquemas Drizzle para las nuevas tablas
export const cashScheduleConfig = pgTable("cash_schedule_config", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  autoOpenEnabled: boolean("auto_open_enabled").default(false),
  autoCloseEnabled: boolean("auto_close_enabled").default(false),
  openHour: integer("open_hour").default(9),
  openMinute: integer("open_minute").default(0),
  closeHour: integer("close_hour").default(18),
  closeMinute: integer("close_minute").default(0),
  activeDays: text("active_days").default("1,2,3,4,5,6,7"),
  timezone: text("timezone").default("America/Argentina/Buenos_Aires"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cashAutoOperationsLog = pgTable("cash_auto_operations_log", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  operationType: text("operation_type").notNull(),
  cashRegisterId: integer("cash_register_id"),
  scheduledTime: timestamp("scheduled_time"),
  executedTime: timestamp("executed_time").defaultNow(),
  status: text("status").default("success"),
  errorMessage: text("error_message"),
  reportId: integer("report_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export class CashScheduleStorage {
  // Obtener configuración de horarios para un cliente
  async getScheduleConfig(clientId: number) {
    try {
      const [config] = await db
        .select()
        .from(cashScheduleConfig)
        .where(eq(cashScheduleConfig.clientId, clientId));

      return config || null;
    } catch (error) {
      console.error('Error getting schedule config:', error);
      return null;
    }
  }

  // Crear o actualizar configuración de horarios
  async upsertScheduleConfig(clientId: number, configData: any) {
    try {
      const existingConfig = await this.getScheduleConfig(clientId);

      // Prepare data with proper timestamp handling
      const cleanData = {
        autoOpenEnabled: configData.autoOpenEnabled || false,
        autoCloseEnabled: configData.autoCloseEnabled || false,
        openHour: parseInt(configData.openHour) || 9,
        openMinute: parseInt(configData.openMinute) || 0,
        closeHour: parseInt(configData.closeHour) || 18,
        closeMinute: parseInt(configData.closeMinute) || 0,
        activeDays: configData.activeDays || "1,2,3,4,5,6,7",
        timezone: configData.timezone || "America/Argentina/Buenos_Aires",
      };

      if (existingConfig) {
        // Actualizar existente
        const [updated] = await db
          .update(cashScheduleConfig)
          .set({
            ...cleanData,
            updatedAt: new Date(),
          })
          .where(eq(cashScheduleConfig.clientId, clientId))
          .returning();

        return updated;
      } else {
        // Crear nuevo
        const [created] = await db
          .insert(cashScheduleConfig)
          .values({
            clientId,
            ...cleanData,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return created;
      }
    } catch (error) {
      console.error('Error upserting schedule config:', error);
      throw error;
    }
  }

  // Registrar operación automática en el log
  async logAutoOperation(operationData: {
    clientId: number;
    operationType: string;
    cashRegisterId?: number;
    scheduledTime?: Date;
    status?: string;
    errorMessage?: string;
    reportId?: number;
    notes?: string;
  }) {
    try {
      const [logged] = await db
        .insert(cashAutoOperationsLog)
        .values(operationData)
        .returning();

      return logged;
    } catch (error) {
      console.error('Error logging auto operation:', error);
      throw error;
    }
  }

  // Obtener log de operaciones automáticas
  async getAutoOperationsLog(clientId: number, limit = 50) {
    try {
      const logs = await db
        .select()
        .from(cashAutoOperationsLog)
        .where(eq(cashAutoOperationsLog.clientId, clientId))
        .orderBy(cashAutoOperationsLog.executedTime)
        .limit(limit);

      return logs;
    } catch (error) {
      console.error('Error getting auto operations log:', error);
      return [];
    }
  }

  // Verificar si debe ejecutarse una operación automática
  async shouldExecuteAutoOperation(clientId: number, operationType: 'open' | 'close'): Promise<boolean> {
    try {
      const config = await this.getScheduleConfig(clientId);
      if (!config) return false;

      // Crear fecha actual en Argentina usando Intl.DateTimeFormat
      const now = new Date();
      const argentinaTimeFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const argentinaParts = argentinaTimeFormatter.formatToParts(now);
      const argentinaTime = new Date(
        parseInt(argentinaParts.find(p => p.type === 'year')?.value || '2025'),
        parseInt(argentinaParts.find(p => p.type === 'month')?.value || '1') - 1,
        parseInt(argentinaParts.find(p => p.type === 'day')?.value || '1'),
        parseInt(argentinaParts.find(p => p.type === 'hour')?.value || '0'),
        parseInt(argentinaParts.find(p => p.type === 'minute')?.value || '0'),
        parseInt(argentinaParts.find(p => p.type === 'second')?.value || '0')
      );

      const currentDay = argentinaTime.getDay() || 7; // Convert Sunday (0) to 7
      const activeDays = config.activeDays?.split(',').map(d => parseInt(d)) || [];

      const currentHour = argentinaTime.getHours();
      const currentMinute = argentinaTime.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      const openHour = config.openHour || 9;
      const openMinute = config.openMinute || 0;
      const closeHour = config.closeHour || 18;
      const closeMinute = config.closeMinute || 0;

      if (operationType === 'open' && config.autoOpenEnabled) {
        // Verificar si hoy es un día activo para apertura
        if (!activeDays.includes(currentDay)) {
          return false;
        }

        const openTime = openHour * 60 + openMinute;
        const shouldExecute = currentTime >= openTime && currentTime < openTime + 5; // 5 min window

        if (shouldExecute) {
          console.log(`🕐 Should execute AUTO OPEN for client ${clientId}: Argentina time ${argentinaTime.toLocaleString()}, configured time ${openHour}:${openMinute.toString().padStart(2, '0')}`);
        }

        return shouldExecute;
      }

      if (operationType === 'close' && config.autoCloseEnabled) {
        const closeTime = closeHour * 60 + closeMinute;

        // Si el cierre es antes que la apertura, significa que cruza medianoche
        if (closeHour < openHour || (closeHour === openHour && closeMinute <= openMinute)) {
          // El cierre es para el día siguiente, verificar día activo de mañana
          const tomorrowDay = (currentDay % 7) + 1;
          if (!activeDays.includes(tomorrowDay)) {
            return false;
          }
        } else {
          // El cierre es el mismo día, verificar día activo de hoy
          if (!activeDays.includes(currentDay)) {
            return false;
          }
        }

        const shouldExecute = currentTime >= closeTime && currentTime < closeTime + 5; // 5 min window

        if (shouldExecute) {
          console.log(`🕐 Should execute AUTO CLOSE for client ${clientId}: Argentina time ${argentinaTime.toLocaleString()}, configured time ${closeHour}:${closeMinute.toString().padStart(2, '0')}`);
        }

        return shouldExecute;
      }

      return false;
    } catch (error) {
      console.error('Error checking auto operation:', error);
      return false;
    }
  }

  // Obtener próximas operaciones programadas
  async getScheduledOperations(clientId: number) {
    try {
      const config = await this.getScheduleConfig(clientId);
      if (!config) return [];

      // Crear fecha Argentina CORRECTA usando Intl API
      const now = new Date();
      const argentinaFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const argentinaParts = argentinaFormatter.formatToParts(now);
      const argentinaTime = new Date(
        parseInt(argentinaParts.find(p => p.type === 'year')?.value || '2025'),
        parseInt(argentinaParts.find(p => p.type === 'month')?.value || '1') - 1,
        parseInt(argentinaParts.find(p => p.type === 'day')?.value || '1'),
        parseInt(argentinaParts.find(p => p.type === 'hour')?.value || '0'),
        parseInt(argentinaParts.find(p => p.type === 'minute')?.value || '0'),
        parseInt(argentinaParts.find(p => p.type === 'second')?.value || '0')
      );

      const operations = [];
      const activeDaysArray = config.activeDays?.split(',').map(d => parseInt(d)) || [1,2,3,4,5,6,7];

      const openHour = config.openHour || 9;
      const openMinute = config.openMinute || 0;
      const closeHour = config.closeHour || 18;
      const closeMinute = config.closeMinute || 0;

      // Obtener el día actual en Argentina (1=Lunes, 7=Domingo)
      const currentDay = argentinaTime.getDay() === 0 ? 7 : argentinaTime.getDay();
      const isActiveDay = activeDaysArray.includes(currentDay);

      // Calcular próxima apertura CORRECTA usando horarios configurados
      if (config.autoOpenEnabled) {
        let nextOpen = new Date(argentinaTime);
        nextOpen.setHours(openHour, openMinute, 0, 0);

        // Si ya pasó la hora de apertura de hoy, mover al siguiente día activo
        if (nextOpen <= argentinaTime) {
          let daysToAdd = 1;
          let testDay = (currentDay % 7) + 1; // Siguiente día
          
          // Buscar el próximo día activo
          while (daysToAdd <= 7 && !activeDaysArray.includes(testDay)) {
            testDay = (testDay % 7) + 1;
            daysToAdd++;
          }

          nextOpen = new Date(argentinaTime);
          nextOpen.setDate(argentinaTime.getDate() + daysToAdd);
          nextOpen.setHours(openHour, openMinute, 0, 0);
        } else if (!isActiveDay) {
          // Si hoy no es día activo, buscar el próximo día activo
          let daysToAdd = 1;
          let testDay = (currentDay % 7) + 1;
          
          while (daysToAdd <= 7 && !activeDaysArray.includes(testDay)) {
            testDay = (testDay % 7) + 1;
            daysToAdd++;
          }

          nextOpen = new Date(argentinaTime);
          nextOpen.setDate(argentinaTime.getDate() + daysToAdd);
          nextOpen.setHours(openHour, openMinute, 0, 0);
        }
        
        operations.push({
          type: 'auto_open',
          scheduledTime: nextOpen,
          enabled: config.autoOpenEnabled,
        });
      }

      // Calcular próximo cierre CORRECTA usando horarios configurados
      if (config.autoCloseEnabled) {
        let nextClose = new Date(argentinaTime);
        nextClose.setHours(closeHour, closeMinute, 0, 0);

        // Si ya pasó la hora de cierre de hoy, mover al siguiente día activo
        if (nextClose <= argentinaTime) {
          let daysToAdd = 1;
          let testDay = (currentDay % 7) + 1; // Siguiente día
          
          // Buscar el próximo día activo
          while (daysToAdd <= 7 && !activeDaysArray.includes(testDay)) {
            testDay = (testDay % 7) + 1;
            daysToAdd++;
          }

          nextClose = new Date(argentinaTime);
          nextClose.setDate(argentinaTime.getDate() + daysToAdd);
          nextClose.setHours(closeHour, closeMinute, 0, 0);
        } else if (!isActiveDay) {
          // Si hoy no es día activo, buscar el próximo día activo
          let daysToAdd = 1;
          let testDay = (currentDay % 7) + 1;
          
          while (daysToAdd <= 7 && !activeDaysArray.includes(testDay)) {
            testDay = (testDay % 7) + 1;
            daysToAdd++;
          }

          nextClose = new Date(argentinaTime);
          nextClose.setDate(argentinaTime.getDate() + daysToAdd);
          nextClose.setHours(closeHour, closeMinute, 0, 0);
        }
        
        operations.push({
          type: 'auto_close',
          scheduledTime: nextClose,
          enabled: config.autoCloseEnabled,
        });
      }

      console.log(`🕐 REAL Argentina time: ${argentinaTime.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);
      console.log(`🕐 Config: Open ${openHour}:${openMinute.toString().padStart(2, '0')}, Close ${closeHour}:${closeMinute.toString().padStart(2, '0')}`);
      console.log(`🕐 Current day: ${currentDay}, Active days: ${activeDaysArray}, Is active: ${isActiveDay}`);
      console.log(`🕐 Scheduled operations for client ${clientId}:`, operations.map(op => ({
        type: op.type,
        enabled: op.enabled,
        scheduledTime: op.scheduledTime.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
      })));
      
      return operations;
    } catch (error) {
      console.error('Error getting scheduled operations:', error);
      return [];
    }
  }
}

// Exportar instancia singleton
export const cashScheduleStorage = new CashScheduleStorage();