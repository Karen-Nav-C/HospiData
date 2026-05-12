const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const path = require("path");
const svgCaptcha = require("svg-captcha");

const app = express();


// ======================================
// CONFIGURACIÓN Y MIDDLEWARES
// ======================================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Archivos públicos
app.use(express.static(path.join(__dirname, "public")));

// Sesiones
app.use(session({
    secret: "hospiData_ultra_secreto_2026",
    resave: false,
    saveUninitialized: true
}));


// ======================================
// CONEXIÓN A MARIADB / MYSQL
// ======================================

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "hospiData",
    port: 3306
});

// Conectar a la base de datos
db.connect((err) => {

    if (err) {
        console.log("❌ Error de conexión:", err);
    } else {
        console.log("✅ Conectado exitosamente a MariaDB");
    }

});


// ======================================
// RUTA PRINCIPAL
// ======================================

app.get("/", (req, res) => {

    res.sendFile(path.join(__dirname, "public", "login.html"));

});


// ======================================
// CAPTCHA
// ======================================

app.get("/captcha", (req, res) => {

    const captcha = svgCaptcha.create({
        size: 6,
        noise: 3,
        color: true,
        background: "#f0f0f0"
    });

    // Guardar captcha en sesión
    req.session.captcha = captcha.text.toLowerCase();

    res.type("svg");
    res.status(200).send(captcha.data);

});


// ======================================
// LOGIN
// ======================================

app.post("/login", (req, res) => {

    const { correo, password, captcha } = req.body;

    // VALIDAR CAPTCHA
    if (!captcha || captcha.toLowerCase() !== req.session.captcha) {

        return res.send(`
            <h2>❌ Captcha incorrecto</h2>
            <a href="/">Volver al login</a>
        `);

    }

    // BUSCAR USUARIO
    const sql = "SELECT * FROM usuarios WHERE correo = ?";

    db.query(sql, [correo], (err, results) => {

        if (err) {

            console.log(err);

            return res.send(`
                <h2>Error en la base de datos</h2>
            `);

        }

        // USUARIO ENCONTRADO
        if (results.length > 0) {

            const user = results[0];

            // VALIDAR CONTRASEÑA
            if (password === user.password) {

                // GUARDAR SESIÓN
                req.session.user = {
                    id: user.id,
                    nombre: user.nombre,
                    rol: user.rol
                };

                // REDIRECCIONAR
                return res.redirect("/dashboard");

            } else {

                return res.send(`
                    <h2>❌ Contraseña incorrecta</h2>
                    <a href="/">Intentar nuevamente</a>
                `);

            }

        } else {

            return res.send(`
                <h2>❌ Usuario no encontrado</h2>
                <a href="/">Regresar</a>
            `);

        }

    });

});


// ======================================
// DASHBOARD
// ======================================

app.get("/dashboard", (req, res) => {

    // VALIDAR SESIÓN
    if (!req.session.user) {

        return res.redirect("/");

    }

    // CARGAR DASHBOARD
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));

});


// ======================================
// DATOS DEL USUARIO
// ======================================

app.get("/user", (req, res) => {

    if (!req.session.user) {

        return res.json({
            error: "No autorizado"
        });

    }

    res.json(req.session.user);

});


// ======================================
// LOGOUT
// ======================================

app.get("/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect("/");

    });

});


// ======================================
// SERVIDOR
// ======================================

// IMPORTANTE PARA RENDER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`🚀 HospiData corriendo en puerto ${PORT}`);

});