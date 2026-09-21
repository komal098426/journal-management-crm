"use client";

import { CalendarDays, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable, Pagination, SearchBox } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/Modal";
import { ConfirmDelete, RowActions } from "@/components/ui/RowActions";
import { Avatar, ErrorState, Field, LoadingState, PanelHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useApi, useList } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/api";
import { formatDate, todayIso } from "@/lib/format";
import { attendanceService, departmentService, employeeService, operationService, taskService } from "@/services/erp";
import type { AttendanceRecord, Department, Employee, Operation, Task } from "@/types/erp";

const COLORS = ["#c9c0ff", "#bfe2b6", "#f0d29b", "#e9b9b5", "#b9c9d8", "#d7b9a6"];

const useDepartments = () => useApi(() => departmentService.list({ pageSize: 100, sort: "name", order: "asc" }), []);
const useEmployees = () => useApi(() => employeeService.list({ pageSize: 100, sort: "name", order: "asc" }), []);

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export function PeopleView() {
  const { can } = useAuth();
  const toast = useToast();
  const departments = useDepartments();
  const list = useList<Employee>(query => employeeService.list(query), { sort: "name", order: "asc" });
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const e0 = editing === "new" ? null : editing;

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title="People"
        subtitle={`${list.total} team members across ${departments.data?.total ?? 0} work areas`}
        actions={can("hr:write") ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> Add employee</button> : null}
      />
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search name, ID or department" />
        <select className="select-dark" value={list.params.department_id ?? ""} onChange={e => list.setParam("department_id", e.target.value || undefined)} aria-label="Department">
          <option value="">All departments</option>
          {departments.data?.data.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="select-dark" value={list.params.status ?? ""} onChange={e => list.setParam("status", e.target.value || undefined)} aria-label="Status">
          <option value="">Any status</option>
          <option>Active</option><option>On leave</option><option>Offline</option>
        </select>
      </div>
      <DataTable<Employee>
        columns={[
          { key: "name", label: "Employee", sortable: true, render: e => <div className="person-cell"><Avatar name={e.name} color={e.color} /><div><b>{e.name}</b><span>{e.employee_code} · {e.role}</span></div></div> },
          { key: "department_name", label: "Department", sortable: true, render: e => e.department_name ?? "—" },
          { key: "working_hours", label: "Working hours", render: e => <span className="mono">{e.working_hours}</span> },
          { key: "status", label: "Status", sortable: true, render: e => <StatusBadge status={e.status} /> },
          { key: "email", label: "Contact", render: e => <span className="mono">{e.email ?? e.phone ?? "—"}</span> },
          { key: "actions", label: "", render: e => <RowActions label={e.name} onEdit={can("hr:write") ? () => setEditing(e) : undefined} onDelete={can("hr:write") ? () => setDeleting(e) : undefined} /> },
        ]}
        rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort}
        emptyMessage="No team members match this search."
      />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {editing && (
        <FormModal
          title={e0 ? `Edit ${e0.name}` : "Add employee"}
          description="Keep the record lightweight now; add detail whenever you need it."
          submitLabel={e0 ? "Save employee" : "Add employee"}
          onClose={() => setEditing(null)}
          onSubmit={async form => {
            const body = {
              name: form.get("name"), employee_code: form.get("employee_code"), department_id: form.get("department_id") || null,
              role: form.get("role"), working_hours: form.get("working_hours"), status: form.get("status"),
              email: form.get("email"), phone: form.get("phone"), color: form.get("color"),
            };
            const saved = e0 ? await employeeService.update(e0.id, body) : await employeeService.create(body);
            toast(`${saved.name} ${e0 ? "saved" : "added to the team"}`);
            setEditing(null);
            list.reload();
          }}
        >
          <div className="form-grid">
            <Field label="Full name" full><input className="input-dark" name="name" defaultValue={e0?.name} placeholder="e.g. Hira Malik" required /></Field>
            <Field label="Department">
              <select className="select-dark" name="department_id" defaultValue={e0?.department_id ?? ""}>
                <option value="">No department</option>
                {departments.data?.data.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Role"><input className="input-dark" name="role" defaultValue={e0?.role} placeholder="Work role" /></Field>
            <Field label="Employee ID"><input className="input-dark" name="employee_code" defaultValue={e0?.employee_code} placeholder="Auto-generated if blank" /></Field>
            <Field label="Working hours"><input className="input-dark" name="working_hours" defaultValue={e0?.working_hours ?? "09:00 – 17:00"} /></Field>
            <Field label="Status">
              <select className="select-dark" name="status" defaultValue={e0?.status ?? "Active"}>
                <option>Active</option><option>On leave</option><option>Offline</option>
              </select>
            </Field>
            <Field label="Avatar colour">
              <select className="select-dark" name="color" defaultValue={e0?.color ?? COLORS[0]}>
                {COLORS.map(color => <option key={color} value={color}>{color}</option>)}
              </select>
            </Field>
            <Field label="Email" full><input className="input-dark" name="email" type="email" defaultValue={e0?.email ?? ""} placeholder="name@organization.com" /></Field>
            <Field label="Phone" full><input className="input-dark" name="phone" defaultValue={e0?.phone ?? ""} /></Field>
          </div>
        </FormModal>
      )}
      {deleting && (
        <ConfirmDelete title={`Remove ${deleting.name}?`} message="Their operation records and attendance are removed too; tasks become unassigned."
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await employeeService.remove(deleting.id); toast(`${deleting.name} removed`); setDeleting(null); list.reload(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
export function OperationsView() {
  const { can } = useAuth();
  const toast = useToast();
  const employees = useEmployees();
  const list = useList<Operation>(query => operationService.list(query), { sort: "entry_date", pageSize: 30 });
  const [editing, setEditing] = useState<Operation | "new" | null>(null);
  const op = editing === "new" ? null : editing;

  const grouped = useMemo(() => {
    const groups: { date: string; rows: Operation[] }[] = [];
    for (const row of list.rows) {
      const last = groups[groups.length - 1];
      if (last && last.date === row.entry_date) last.rows.push(row);
      else groups.push({ date: row.entry_date, rows: [row] });
    }
    return groups;
  }, [list.rows]);

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title="Operations / business records"
        subtitle="The connected record of work, orders, stock, and approvals across the organisation"
        actions={can("hr:write") ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> Add record</button> : null}
      />
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search records, people or notes" />
        <input className="input-dark" type="date" value={list.params.from ?? ""} aria-label="From date" onChange={e => list.setParam("from", e.target.value || undefined)} />
        <input className="input-dark" type="date" value={list.params.to ?? ""} aria-label="To date" onChange={e => list.setParam("to", e.target.value || undefined)} />
      </div>
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.rows.length === 0 ? <LoadingState /> : null}
      <div className="timeline" style={{ padding: "7px 20px 20px" }}>
        {grouped.map(group => (
          <div key={group.date} className="journal-record">
            <div className="eyebrow" style={{ marginTop: 10 }}>{formatDate(group.date)}</div>
            {group.rows.map(item => (
              <div key={item.id} className="timeline-row"
                style={{ padding: "15px 0", borderTop: "1px solid rgba(255,255,255,.08)", cursor: can("hr:write") ? "pointer" : undefined }}
                onClick={can("hr:write") ? () => setEditing(item) : undefined}>
                <span className="timeline-time">{item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}</span>
                <Avatar name={item.employee_name} color={item.employee_color} />
                <div className="timeline-copy"><b>{item.work}</b><span>{item.employee_name} · {item.department_name ?? "—"} · {item.description ?? ""}</span></div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        ))}
        {!list.loading && !list.error && list.rows.length === 0 ? <div className="empty-state">No records for these filters.</div> : null}
      </div>
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {editing && (
        <FormModal
          title={op ? `Edit · ${op.work}` : "New record entry"}
          description="Keep the record lightweight now; add detail whenever you need it."
          submitLabel="Save entry"
          onClose={() => setEditing(null)}
          onSubmit={async form => {
            if (op && form.get("delete") === "yes") {
              await operationService.remove(op.id);
              toast("Record deleted");
            } else {
              const body = {
                employee_id: form.get("employee_id"), work: form.get("work"), entry_date: form.get("entry_date"),
                start_time: form.get("start_time"), end_time: form.get("end_time"), status: form.get("status"), description: form.get("description"),
              };
              if (op) await operationService.update(op.id, body); else await operationService.create(body);
              toast("Operations entry saved");
            }
            setEditing(null);
            list.reload();
          }}
        >
          <div className="form-grid">
            <Field label="Employee">
              <select className="select-dark" name="employee_id" defaultValue={op?.employee_id ?? ""} required>
                <option value="">Select employee</option>
                {employees.data?.data.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className="input-dark" name="entry_date" type="date" defaultValue={op?.entry_date ?? todayIso()} required /></Field>
            <Field label="Work / task" full><input className="input-dark" name="work" defaultValue={op?.work} placeholder="e.g. Sample analysis" required /></Field>
            <Field label="Start time"><input className="input-dark" name="start_time" type="time" defaultValue={op?.start_time.slice(0, 5) ?? "09:00"} required /></Field>
            <Field label="End time"><input className="input-dark" name="end_time" type="time" defaultValue={op?.end_time.slice(0, 5) ?? "10:30"} required /></Field>
            <Field label="Status">
              <select className="select-dark" name="status" defaultValue={op?.status ?? "In Progress"}>
                <option>Pending</option><option>In Progress</option><option>Completed</option><option>Cancelled</option>
              </select>
            </Field>
            {op ? (
              <Field label="Delete this record?">
                <select className="select-dark" name="delete" defaultValue="no"><option value="no">No, save changes</option><option value="yes">Yes, delete it</option></select>
              </Field>
            ) : null}
            <Field label="Description" full><textarea className="textarea-dark" name="description" defaultValue={op?.description ?? ""} placeholder="What was done?" /></Field>
          </div>
        </FormModal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance & work schedule
// ---------------------------------------------------------------------------
export function AttendanceView() {
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"daily" | "schedule">("daily");
  const [date, setDate] = useState(todayIso());
  const employees = useEmployees();
  const monday = addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
  const from = [addDays(date, -9), monday].sort()[0];
  const to = [date, addDays(monday, 5)].sort()[1];
  const records = useApi(() => attendanceService.list({ from, to, pageSize: 100, sort: "attendance_date", order: "desc" }), [from, to]);
  const [saving, setSaving] = useState<number | null>(null);

  const byKey = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const record of records.data?.data ?? []) map.set(`${record.employee_id}|${record.attendance_date}`, record);
    return map;
  }, [records.data]);
  const recordFor = (employeeId: number, day = date) => byKey.get(`${employeeId}|${day}`);

  const staff = employees.data?.data ?? [];
  const dayRecords = staff.map(employee => recordFor(employee.id));
  const count = (...statuses: string[]) => dayRecords.filter(record => record && statuses.includes(record.status)).length;

  async function save(employee: Employee, patch: { status?: string; check_in?: string | null }) {
    const existing = recordFor(employee.id);
    const body = {
      employee_id: employee.id,
      attendance_date: date,
      status: patch.status ?? existing?.status ?? "Present",
      check_in: patch.check_in !== undefined ? patch.check_in : existing?.check_in ?? null,
    };
    setSaving(employee.id);
    try {
      if (existing) await attendanceService.update(existing.id, body); else await attendanceService.create(body);
      records.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSaving(null);
    }
  }

  const days = Array.from({ length: 6 }).map((_, i) => addDays(monday, i));
  const tenDays = Array.from({ length: 10 }).map((_, i) => addDays(date, i - 9));
  const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title={tab === "daily" ? "Attendance" : "Work schedule"}
        subtitle={tab === "daily" ? `${longDate} · ${dayRecords.filter(Boolean).length} of ${staff.length} marked` : `Weekly timetable · ${formatDate(days[0])} – ${formatDate(days[5])}`}
        actions={(
          <label className="secondary-button">
            <CalendarDays size={13} />
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} style={{ border: 0, background: "transparent", font: "inherit", color: "inherit" }} aria-label="Date" />
          </label>
        )}
      />
      <nav className="page-tabs" aria-label="Attendance views">
        <button className={`nav-pill ${tab === "daily" ? "active" : ""}`} onClick={() => setTab("daily")}>Daily attendance</button>
        <button className={`nav-pill ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>Work schedule</button>
      </nav>
      {employees.error || records.error ? (
        <ErrorState message={employees.error ?? records.error ?? ""} onRetry={() => { employees.reload(); records.reload(); }} />
      ) : null}
      {tab === "daily" ? (
        <>
          <div className="metric-grid">
            <div className="mini-metric"><span>Present</span><b style={{ color: "#6f9a66" }}>{count("Present")}</b></div>
            <div className="mini-metric"><span>Late / half day</span><b style={{ color: "#b08a3e" }}>{count("Late", "Half Day")}</b></div>
            <div className="mini-metric"><span>Absent / leave</span><b style={{ color: "#b8746b" }}>{count("Absent", "Leave")}</b></div>
          </div>
          <DataTable<Employee>
            columns={[
              { key: "name", label: "Employee", render: e => <div className="person-cell"><Avatar name={e.name} color={e.color} /><b>{e.name}</b></div> },
              { key: "department_name", label: "Department", render: e => e.department_name ?? "—" },
              {
                key: "check_in", label: "Check-in",
                render: e => {
                  const current = recordFor(e.id)?.check_in?.slice(0, 5) ?? "";
                  return can("hr:write") ? (
                    <input className="input-dark" type="time" disabled={saving === e.id} defaultValue={current} key={`${e.id}-${date}-${current}`}
                      onBlur={ev => { if (ev.target.value !== current) void save(e, { check_in: ev.target.value || null }); }}
                      aria-label={`Check-in for ${e.name}`} />
                  ) : <span className="mono">{current || "—"}</span>;
                },
              },
              {
                key: "attendance", label: "Attendance",
                render: e => {
                  const record = recordFor(e.id);
                  if (!can("hr:write")) return record ? <StatusBadge status={record.status} /> : <StatusBadge status="pending" label="Not marked" />;
                  return (
                    <select className="select-dark" value={record?.status ?? ""} disabled={saving === e.id}
                      onChange={ev => { if (ev.target.value) void save(e, { status: ev.target.value }); }} aria-label={`Attendance for ${e.name}`}>
                      <option value="">Not marked</option>
                      <option>Present</option><option>Late</option><option>Half Day</option><option>Leave</option><option>Absent</option>
                    </select>
                  );
                },
              },
              {
                key: "overview", label: "Last 10 days",
                render: e => (
                  <div style={{ display: "flex", gap: 3 }}>
                    {tenDays.map(day => {
                      const status = recordFor(e.id, day)?.status;
                      const background = !status ? "rgba(90,106,128,.15)" : status === "Present" ? "#c9e4bf" : status === "Late" || status === "Half Day" ? "#f0d49b" : "#efb7ae";
                      return <i key={day} title={`${formatDate(day)} · ${status ?? "not marked"}`} style={{ display: "block", width: 10, height: 10, borderRadius: 3, background }} />;
                    })}
                  </div>
                ),
              },
            ]}
            rows={staff}
            loading={employees.loading || records.loading}
            emptyMessage="Add employees under People to track attendance."
          />
        </>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div className="week-grid">
            <div className="week-head">TEAM</div>
            {days.map(day => (
              <div className="week-head" key={day}>
                {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}
              </div>
            ))}
            {staff.map(employee => (
              <div key={employee.id} style={{ display: "contents" }}>
                <div className="mono" style={{ color: "#4f555e" }}>{employee.name.split(" ")[0]}</div>
                {days.map(day => {
                  const record = recordFor(employee.id, day);
                  const away = record && (record.status === "Leave" || record.status === "Absent");
                  return (
                    <div key={day}>
                      {employee.status === "Active" || record ? (
                        <div className="schedule-block" style={{ color: "#4f555e", background: away ? "rgba(239,183,174,.3)" : undefined }}>
                          <b>{away ? record.status : employee.working_hours}</b><br />
                          <small>{employee.department_name ?? employee.role}</small>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {staff.length === 0 && !employees.loading ? <div className="empty-state">Add employees under People to build the schedule.</div> : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
const NEXT_STATUS: Record<Task["status"], Task["status"]> = { Pending: "In Progress", "In Progress": "Completed", Completed: "Pending" };

export function TasksView() {
  const { can } = useAuth();
  const toast = useToast();
  const employees = useEmployees();
  const departments = useDepartments();
  const list = useList<Task>(query => taskService.list(query), { sort: "created_at" });
  const all = useApi(() => taskService.list({ pageSize: 100 }), [list.data]);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const task = editing === "new" ? null : editing;

  const today = todayIso();
  const tasks = all.data?.data ?? [];
  const open = tasks.filter(t => t.status !== "Completed").length;
  const dueToday = tasks.filter(t => t.status !== "Completed" && t.due_date === today).length;
  const rate = tasks.length ? Math.round((tasks.filter(t => t.status === "Completed").length / tasks.length) * 100) : 0;

  const advance = async (item: Task) => {
    try {
      await taskService.update(item.id, { ...item, status: NEXT_STATUS[item.status] });
      list.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader title="Tasks" subtitle="Keep ownership, priority and due dates visible"
        actions={can("hr:write") ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> New task</button> : null} />
      <div className="metric-grid">
        <div className="mini-metric"><span>Open tasks</span><b>{String(open).padStart(2, "0")}</b></div>
        <div className="mini-metric"><span>Due today</span><b>{String(dueToday).padStart(2, "0")}</b></div>
        <div className="mini-metric"><span>Completion rate</span><b>{rate}%</b></div>
      </div>
      <div className="toolbar"><SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search tasks or owners" /></div>
      <DataTable<Task>
        columns={[
          { key: "title", label: "Task", sortable: true, render: t => <><b>{t.title}</b><div className="panel-subtitle">{t.department_name ?? "—"}</div></> },
          { key: "employee_name", label: "Owner", sortable: true, render: t => t.employee_name ?? "Unassigned" },
          { key: "due_date", label: "Due date", sortable: true, render: t => <span className="mono">{t.due_date === today ? "Today" : formatDate(t.due_date)}</span> },
          { key: "priority", label: "Priority", sortable: true, render: t => <StatusBadge status={t.priority} /> },
          {
            key: "status", label: "Status", sortable: true,
            render: t => can("hr:write")
              ? <button style={{ border: 0, background: "transparent", padding: 0 }} onClick={ev => { ev.stopPropagation(); void advance(t); }} title="Advance status"><StatusBadge status={t.status} /></button>
              : <StatusBadge status={t.status} />,
          },
          { key: "actions", label: "", render: t => <RowActions label={t.title} onEdit={can("hr:write") ? () => setEditing(t) : undefined} onDelete={can("hr:write") ? () => setDeleting(t) : undefined} /> },
        ]}
        rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort} emptyMessage="No tasks yet."
      />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {editing && (
        <FormModal title={task ? "Edit task" : "Create a task"} submitLabel={task ? "Save task" : "Create task"}
          onClose={() => setEditing(null)}
          onSubmit={async form => {
            const body = {
              title: form.get("title"), employee_id: form.get("employee_id") || null, department_id: form.get("department_id") || null,
              due_date: form.get("due_date") || null, priority: form.get("priority"), status: form.get("status"), description: form.get("description"),
            };
            if (task) await taskService.update(task.id, body); else await taskService.create(body);
            toast(task ? "Task saved" : "Task created");
            setEditing(null);
            list.reload();
          }}
        >
          <div className="form-grid">
            <Field label="Task title" full><input className="input-dark" name="title" defaultValue={task?.title} placeholder="e.g. Review monthly report" required /></Field>
            <Field label="Assigned to">
              <select className="select-dark" name="employee_id" defaultValue={task?.employee_id ?? ""}>
                <option value="">Unassigned</option>
                {employees.data?.data.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <select className="select-dark" name="department_id" defaultValue={task?.department_id ?? ""}>
                <option value="">No department</option>
                {departments.data?.data.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Due date"><input className="input-dark" name="due_date" type="date" defaultValue={task?.due_date ?? ""} /></Field>
            <Field label="Priority">
              <select className="select-dark" name="priority" defaultValue={task?.priority ?? "Medium"}><option>Low</option><option>Medium</option><option>High</option></select>
            </Field>
            <Field label="Status">
              <select className="select-dark" name="status" defaultValue={task?.status ?? "Pending"}><option>Pending</option><option>In Progress</option><option>Completed</option></select>
            </Field>
            <Field label="Description" full><textarea className="textarea-dark" name="description" defaultValue={task?.description ?? ""} /></Field>
          </div>
        </FormModal>
      )}
      {deleting && (
        <ConfirmDelete title="Delete this task?" message={deleting.title} onClose={() => setDeleting(null)}
          onConfirm={async () => { await taskService.remove(deleting.id); toast("Task deleted"); setDeleting(null); list.reload(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
export function DepartmentsView() {
  const { can } = useAuth();
  const toast = useToast();
  const departments = useDepartments();
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const dept = editing === "new" ? null : editing;

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader title="Departments / work areas" subtitle={`${departments.data?.total ?? 0} focused teams keep the organisation moving`}
        actions={can("hr:write") ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> Add department</button> : null} />
      {departments.error ? <ErrorState message={departments.error} onRetry={departments.reload} /> : null}
      {departments.loading && !departments.data ? <LoadingState /> : null}
      <div className="dept-grid">
        {departments.data?.data.map(item => (
          <div className="dept-card" key={item.id} style={{ cursor: can("hr:write") ? "pointer" : undefined }} onClick={can("hr:write") ? () => setEditing(item) : undefined}>
            <span className="dept-color" style={{ background: item.color }} />
            <h3>{item.name}</h3>
            <p>{item.detail ?? item.code}</p>
            <footer><span>{item.head ?? "No head assigned"}</span><b>{item.employee_count} staff</b></footer>
          </div>
        ))}
      </div>
      {departments.data?.data.length === 0 ? <div className="empty-state">No departments yet.</div> : null}
      {editing && (
        <FormModal title={dept ? `Edit ${dept.name}` : "Add department"} submitLabel="Save department"
          onClose={() => setEditing(null)}
          onSubmit={async form => {
            if (dept && form.get("delete") === "yes") {
              await departmentService.remove(dept.id);
              toast("Department deleted");
            } else {
              const body = { name: form.get("name"), code: form.get("code"), head: form.get("head"), color: form.get("color"), detail: form.get("detail") };
              if (dept) await departmentService.update(dept.id, body); else await departmentService.create(body);
              toast("Department saved");
            }
            setEditing(null);
            departments.reload();
          }}
        >
          <div className="form-grid">
            <Field label="Name"><input className="input-dark" name="name" defaultValue={dept?.name} required /></Field>
            <Field label="Code"><input className="input-dark" name="code" defaultValue={dept?.code} required maxLength={12} /></Field>
            <Field label="Head"><input className="input-dark" name="head" defaultValue={dept?.head ?? ""} /></Field>
            <Field label="Colour">
              <select className="select-dark" name="color" defaultValue={dept?.color ?? COLORS[0]}>
                {COLORS.map(color => <option key={color} value={color}>{color}</option>)}
              </select>
            </Field>
            <Field label="Description" full><input className="input-dark" name="detail" defaultValue={dept?.detail ?? ""} /></Field>
            {dept ? (
              <Field label="Delete this department?" full>
                <select className="select-dark" name="delete" defaultValue="no"><option value="no">No, save changes</option><option value="yes">Yes — employees become unassigned</option></select>
              </Field>
            ) : null}
          </div>
        </FormModal>
      )}
    </div>
  );
}
