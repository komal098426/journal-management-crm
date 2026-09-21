import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  initials: varchar("initials", { length: 4 }).notNull(),
  employeeId: varchar("employeeId", { length: 32 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  department: varchar("department", { length: 80 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  joiningDate: varchar("joiningDate", { length: 20 }).notNull(),
  workingHours: varchar("workingHours", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["Active", "On leave", "Offline"]).default("Active").notNull(),
  notes: text("notes"),
  avatarColor: varchar("avatarColor", { length: 24 }).default("#f3c7a9").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const journalEntries = mysqlTable("journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  employeeName: varchar("employeeName", { length: 120 }).notNull(),
  department: varchar("department", { length: 80 }).notNull(),
  work: varchar("work", { length: 180 }).notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  startTime: varchar("startTime", { length: 20 }).notNull(),
  endTime: varchar("endTime", { length: 20 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["Pending", "In Progress", "Completed", "Cancelled"]).default("Pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  employeeName: varchar("employeeName", { length: 120 }).notNull(),
  department: varchar("department", { length: 80 }).notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["Present", "Absent", "Late", "Leave", "Half Day"]).default("Present").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  employeeName: varchar("employeeName", { length: 120 }).notNull(),
  department: varchar("department", { length: 80 }).notNull(),
  createdDate: varchar("createdDate", { length: 20 }).notNull(),
  dueDate: varchar("dueDate", { length: 20 }).notNull(),
  priority: mysqlEnum("priority", ["Low", "Medium", "High"]).default("Medium").notNull(),
  status: mysqlEnum("status", ["Pending", "In Progress", "Completed"]).default("Pending").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  code: varchar("code", { length: 12 }).notNull(),
  employeeCount: int("employeeCount").default(0).notNull(),
  head: varchar("head", { length: 120 }),
  color: varchar("color", { length: 24 }).default("#d9d2ff").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;
