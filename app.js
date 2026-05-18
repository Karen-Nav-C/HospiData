// ======================================
// HOSPIDATA — app.js
// Node.js + Express + Supabase
// ======================================

const express    = require("express");
const session    = require("express-session");
const path       = require("path");
const svgCaptcha = require("svg-captcha");
const bcrypt     = require("bcrypt");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ======================================
// SUPABASE
// ======================================
const SUPABASE_URL = "https://tedovpvyxcjtzthjpumy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZG92cHZ5eGNqdHp0aGpwdW15Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA2MjcwMSwiZXhwIjoyMDk0NjM4NzAxfQ.1lD7fkgmuPgFAEYph1n2-krLkPPa002FnRWJw6fKfus";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ======================================
// MIDDLEWARES
// ======================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    secret: "hospiData_ultra_secreto_2026",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 4 }
}));

// ======================================
// MIDDLEWARE: verificar sesión y roles
// ======================================
function requireAuth(roles = []) {
    return (req, res, next) => {
        if (!req.session.user) return res.redirect("/");
        if (roles.length && !roles.includes(req.session.user.rol)) {
            return res.status(403).json({ error: "Acceso denegado para tu rol." });
        }
        next();
    };
}

// ======================================
// RUTAS DE PÁGINAS
// ======================================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/visitantes", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "visitantes.html"));
});

app.get("/dashboard", requireAuth(), (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// ======================================
// CAPTCHA
// ======================================
app.get("/captcha", (req, res) => {
    const captcha = svgCaptcha.create({
        size: 6,
        noise: 3,
        color: true,
        background: "#f0f4f8"
    });
    req.session.captcha = captcha.text.toLowerCase();
    res.type("svg").send(captcha.data);
});

// ======================================
// LOGIN
// ======================================
app.post("/login", async (req, res) => {
    const { correo, password, captcha } = req.body;

    if (!captcha || captcha.toLowerCase() !== req.session.captcha) {
        return res.redirect("/?error=captcha");
    }

    const { data: users, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("correo", correo)
        .eq("activo", 1)
        .limit(1);

    if (error || !users || users.length === 0) {
        return res.redirect("/?error=usuario");
    }

    const user = users[0];

    let passwordOk = false;
    if (user.password.startsWith("$2b$") || user.password.startsWith("$2a$")) {
        passwordOk = await bcrypt.compare(password, user.password);
    } else {
        passwordOk = password === user.password;
    }

    if (!passwordOk) return res.redirect("/?error=password");

    await supabase.from("registros").insert({
        usuario_id: user.id,
        accion: "login",
        detalle: "Inicio de sesión exitoso",
        ip: req.ip
    });

    req.session.user = { id: user.id, nombre: user.nombre, rol: user.rol };
    res.redirect("/dashboard");
});

// ======================================
// CERRAR SESIÓN
// ======================================
app.get("/logout", async (req, res) => {
    if (req.session.user) {
        await supabase.from("registros").insert({
            usuario_id: req.session.user.id,
            accion: "logout",
            detalle: "Sesión cerrada",
            ip: req.ip
        });
    }
    req.session.destroy(() => res.redirect("/"));
});

// ======================================
// API: sesión actual
// ======================================
app.get("/api/me", requireAuth(), (req, res) => {
    res.json(req.session.user);
});

// ======================================
// API: USUARIOS
// ======================================
app.get("/api/usuarios", requireAuth([
    "admin_principal","admin_secundario"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("usuarios")
        .select("id, nombre, correo, rol, activo, creado_en")
        .order("nombre");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/usuarios", requireAuth([
    "admin_principal","admin_secundario"
]), async (req, res) => {
    const { nombre, correo, password, rol } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
        .from("usuarios")
        .insert({ nombre, correo, password: hash, rol, activo: 1 })
        .select("id, nombre, correo, rol, activo")
        .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.patch("/api/usuarios/:id/activo", requireAuth([
    "admin_principal","admin_secundario"
]), async (req, res) => {
    const { activo } = req.body;
    const { data, error } = await supabase
        .from("usuarios")
        .update({ activo })
        .eq("id", req.params.id)
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete("/api/usuarios/:id", requireAuth([
    "admin_principal"
]), async (req, res) => {
    if (req.session.user.id === parseInt(req.params.id)) {
        return res.status(400).json({ error: "No puedes eliminarte a ti mismo" });
    }
    const { error } = await supabase.from("usuarios").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
});

// ======================================
// API: PACIENTES
// ======================================
app.get("/api/pacientes", requireAuth([
    "admin_principal","admin_secundario","personal_medico",
    "medico_psiquiatra","personal_enfermeria","personal_administrativo"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("pacientes")
        .select("*, medico:usuarios(nombre)")
        .order("creado_en", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/pacientes", requireAuth([
    "admin_principal","admin_secundario","personal_medico","medico_psiquiatra"
]), async (req, res) => {
    const { nombre, edad, telefono, direccion, habitacion, diagnostico, medico_id } = req.body;
    const { data, error } = await supabase
        .from("pacientes")
        .insert({ nombre, edad, telefono, direccion, habitacion, diagnostico, medico_id })
        .select().single();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from("registros").insert({
        usuario_id: req.session.user.id,
        accion: "crear_paciente",
        detalle: `Paciente creado: ${nombre}`,
        ip: req.ip
    });
    res.json(data);
});

app.delete("/api/pacientes/:id", requireAuth([
    "admin_principal","admin_secundario"
]), async (req, res) => {
    const { error } = await supabase.from("pacientes").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await supabase.from("registros").insert({
        usuario_id: req.session.user.id,
        accion: "eliminar_paciente",
        detalle: `Paciente ID ${req.params.id} eliminado`,
        ip: req.ip
    });
    res.json({ ok: true });
});

// ======================================
// API: PERSONAL
// ======================================
app.get("/api/personal", requireAuth([
    "admin_principal","admin_secundario","recursos_humanos"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("personal")
        .select("*, usuario:usuarios(nombre, correo, rol)")
        .order("creado_en", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/personal", requireAuth([
    "admin_principal","admin_secundario"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("personal")
        .insert(req.body)
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// ======================================
// API: CITAS — pública (sin login)
// ======================================
app.post("/api/citas/publica", async (req, res) => {
    const { visitante_nombre, paciente_nombre, fecha, motivo } = req.body;
    if (!visitante_nombre || !paciente_nombre || !fecha) {
        return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    let folio, existe = true;
    while (existe) {
        const num = Math.floor(1000 + Math.random() * 9000);
        folio = `HOSP-${num}`;
        const { data } = await supabase
            .from("citas").select("id").eq("folio", folio).limit(1);
        existe = data && data.length > 0;
    }

    const { data, error } = await supabase
        .from("citas")
        .insert({ folio, visitante_nombre, paciente_nombre, fecha, motivo, estado: "pendiente" })
        .select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ folio: data.folio, cita: data });
});

app.get("/api/citas/folio/:folio", async (req, res) => {
    const { data, error } = await supabase
        .from("citas")
        .select("folio, visitante_nombre, paciente_nombre, fecha, motivo, estado")
        .eq("folio", req.params.folio.toUpperCase())
        .single();
    if (error || !data) return res.status(404).json({ error: "Folio no encontrado" });
    res.json(data);
});

// ======================================
// API: CITAS — autenticado
// ======================================
app.get("/api/citas", requireAuth([
    "admin_principal","admin_secundario","personal_medico",
    "medico_psiquiatra","personal_enfermeria"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("citas")
        .select("*")
        .order("fecha", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.patch("/api/citas/:id/estado", requireAuth([
    "admin_principal","admin_secundario","personal_medico",
    "medico_psiquiatra","personal_enfermeria"
]), async (req, res) => {
    const { estado } = req.body;
    const validos = ["pendiente","aprobada","rechazada","completada"];
    if (!validos.includes(estado)) return res.status(400).json({ error: "Estado inválido" });

    const { data, error } = await supabase
        .from("citas")
        .update({ estado })
        .eq("id", req.params.id)
        .select().single();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from("registros").insert({
        usuario_id: req.session.user.id,
        accion: "actualizar_cita",
        detalle: `Cita ID ${req.params.id} → ${estado}`,
        ip: req.ip
    });
    res.json(data);
});

// ======================================
// API: MEDICAMENTOS
// ======================================
app.get("/api/medicamentos", requireAuth([
    "admin_principal","admin_secundario","personal_medico",
    "medico_psiquiatra","personal_farmacia","personal_enfermeria"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("medicamentos")
        .select("*")
        .order("nombre");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/medicamentos", requireAuth([
    "admin_principal","admin_secundario","personal_farmacia"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("medicamentos")
        .insert(req.body)
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    await supabase.from("registros").insert({
        usuario_id: req.session.user.id,
        accion: "crear_medicamento",
        detalle: `Medicamento: ${req.body.nombre}`,
        ip: req.ip
    });
    res.json(data);
});

app.delete("/api/medicamentos/:id", requireAuth([
    "admin_principal","admin_secundario"
]), async (req, res) => {
    const { error } = await supabase.from("medicamentos").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
});

// ======================================
// API: INVENTARIO
// ======================================
app.get("/api/inventario", requireAuth([
    "admin_principal","admin_secundario",
    "personal_administrativo","personal_farmacia"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("inventario")
        .select("*")
        .order("nombre");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/inventario", requireAuth([
    "admin_principal","admin_secundario","personal_administrativo"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("inventario")
        .insert(req.body)
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete("/api/inventario/:id", requireAuth([
    "admin_principal","admin_secundario"
]), async (req, res) => {
    const { error } = await supabase.from("inventario").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
});

// ======================================
// API: RECETAS
// ======================================
app.get("/api/recetas", requireAuth([
    "personal_medico","medico_psiquiatra",
    "personal_farmacia","admin_principal","admin_secundario"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("recetas")
        .select("*, paciente:pacientes(nombre), medico:usuarios(nombre), medicamento:medicamentos(nombre, es_controlado, es_psiquiatrico)")
        .order("fecha", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/recetas", requireAuth([
    "personal_medico","medico_psiquiatra"
]), async (req, res) => {
    const { paciente_id, medicamento_id, dosis, indicaciones } = req.body;
    const user = req.session.user;

    const { data: med } = await supabase
        .from("medicamentos").select("*").eq("id", medicamento_id).single();
    if (!med) return res.status(404).json({ error: "Medicamento no encontrado" });

    const { data: personal } = await supabase
        .from("personal").select("*").eq("usuario_id", user.id).single();

    if (med.es_psiquiatrico && (!personal || !personal.puede_recetar_psiquiatricos)) {
        return res.status(403).json({ error: "No tienes permiso para recetar medicamentos psiquiátricos" });
    }
    if (med.es_controlado && (!personal || !personal.puede_recetar_controlados)) {
        return res.status(403).json({ error: "No tienes permiso para recetar medicamentos controlados" });
    }

    const { data, error } = await supabase
        .from("recetas")
        .insert({ paciente_id, medico_id: user.id, medicamento_id, dosis, indicaciones, estado: "pendiente" })
        .select().single();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from("registros").insert({
        usuario_id: user.id,
        accion: "crear_receta",
        detalle: `Receta para paciente ${paciente_id} — ${med.nombre}`,
        ip: req.ip
    });
    res.json(data);
});

app.patch("/api/recetas/:id/entregar", requireAuth([
    "personal_farmacia"
]), async (req, res) => {
    const { data: receta } = await supabase
        .from("recetas").select("medicamento_id, estado").eq("id", req.params.id).single();

    if (!receta) return res.status(404).json({ error: "Receta no encontrada" });
    if (receta.estado === "entregado") return res.status(400).json({ error: "Ya fue entregada" });

    await supabase.from("entregas_farmacia").insert({
        receta_id: parseInt(req.params.id),
        farmaceutico_id: req.session.user.id,
        observaciones: req.body.observaciones || null
    });

    const { data: med } = await supabase
        .from("medicamentos").select("cantidad").eq("id", receta.medicamento_id).single();
    if (med && med.cantidad > 0) {
        await supabase.from("medicamentos")
            .update({ cantidad: med.cantidad - 1 })
            .eq("id", receta.medicamento_id);
    }

    const { data } = await supabase
        .from("recetas").update({ estado: "entregado" }).eq("id", req.params.id).select().single();
    res.json(data);
});

// ======================================
// API: HISTORIAL MÉDICO
// ======================================
app.get("/api/historial/:paciente_id", requireAuth([
    "admin_principal","admin_secundario","personal_medico",
    "medico_psiquiatra","personal_enfermeria"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("historico_medico")
        .select("*, medico:usuarios(nombre)")
        .eq("paciente_id", req.params.paciente_id)
        .order("fecha", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post("/api/historial", requireAuth([
    "personal_medico","medico_psiquiatra"
]), async (req, res) => {
    const { paciente_id, descripcion } = req.body;
    const { data, error } = await supabase
        .from("historico_medico")
        .insert({ paciente_id, medico_id: req.session.user.id, descripcion })
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// ======================================
// API: ALERTAS
// ======================================
app.get("/api/alertas", requireAuth([
    "admin_principal","admin_secundario","personal_farmacia"
]), async (req, res) => {
    const en30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString().split("T")[0];

    const { data: stockBajo } = await supabase
        .from("medicamentos")
        .select("id, nombre, cantidad, alerta_minimo")
        .lte("cantidad", 20);

    const { data: porCaducar } = await supabase
        .from("medicamentos")
        .select("id, nombre, fecha_caducidad, cantidad")
        .lte("fecha_caducidad", en30dias)
        .gt("cantidad", 0);

    res.json({ stock_bajo: stockBajo || [], por_caducar: porCaducar || [] });
});

// ======================================
// API: LOGS
// ======================================
app.get("/api/registros", requireAuth([
    "admin_principal"
]), async (req, res) => {
    const { data, error } = await supabase
        .from("registros")
        .select("*, usuario:usuarios(nombre, correo)")
        .order("fecha", { ascending: false })
        .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// ======================================
// SERVIDOR
// ======================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🏥 HospiData corriendo en http://localhost:${PORT}`);
    console.log(`✅ Supabase: ${SUPABASE_URL}`);
});