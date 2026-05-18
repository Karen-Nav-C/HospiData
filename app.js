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
// CONEXIÓN A RAILWAY MYSQL
// ======================================

const db = mysql.createConnection({
    host: "yamabiko.proxy.rlwy.net",
    user: "root",
    password: "ROuTqyIabhGptcGuVdZwPqKvqPNNOOOF",
    database: "railway",
    port: 59468
});

// Conectar base de datos
db.connect((err) => {

    if (err) {

        console.log("❌ Error de conexión:", err);

    } else {

        console.log("✅ Conectado exitosamente a MariaDB Railway");

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

    req.session.captcha = captcha.text.toLowerCase();

    res.type("svg");
    res.status(200).send(captcha.data);

});


// ======================================
// LOGIN
// ======================================

app.post("/login", (req, res) => {

    const { correo, password, captcha } = req.body;

    // Validar captcha
    if (!captcha || captcha.toLowerCase() !== req.session.captcha) {

        return res.send(`
            <h2>❌ Captcha incorrecto</h2>
            <a href="/">Volver</a>
        `);

    }

    // Buscar usuario
    const sql = "SELECT * FROM usuarios WHERE correo = ?";

    db.query(sql, [correo], (err, results) => {

        if (err) {

            console.log(err);

            return res.send(`
                <h2>❌ Error en la base de datos</h2>
            `);

        }

        // Usuario encontrado
        if (results.length > 0) {

            const user = results[0];

            // Validar contraseña
            if (password === user.password) {

                // Guardar sesión
                req.session.user = {
                    id: user.id,
                    nombre: user.nombre,
                    rol: user.rol
                };

                // Redirigir
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

    // Verificar sesión
    if (!req.session.user) {

        return res.redirect("/");

    }

    const user = req.session.user;

    let contenido = "";

    // ADMIN
    if (
        user.rol === "admin_principal" ||
        user.rol === "admin_secundario"
    ) {

        contenido = `
            <div class="card-option">
                <h3>👨‍💼 Administración</h3>
                <p>Gestiona personal y usuarios.</p>
            </div>

            <div class="card-option">
                <h3>💊 Farmacia</h3>
                <p>Control de medicamentos.</p>
            </div>

            <div class="card-option">
                <h3>📅 Citas</h3>
                <p>Administrar citas médicas.</p>
            </div>
        `;

    }

    // PACIENTE
    else if (user.rol === "paciente") {

        contenido = `
            <div class="card-option">
                <h3>🩺 Mis Consultas</h3>
                <p>Revisa tu historial médico.</p>
            </div>

            <div class="card-option">
                <h3>💉 Medicamentos</h3>
                <p>Consulta recetas disponibles.</p>
            </div>
        `;

    }

    // MÉDICO
    else if (user.rol === "personal_medico") {

        contenido = `
            <div class="card-option">
                <h3>👨‍⚕️ Pacientes</h3>
                <p>Ver pacientes registrados.</p>
            </div>

            <div class="card-option">
                <h3>📋 Historial Clínico</h3>
                <p>Consultar diagnósticos.</p>
            </div>
        `;

    }

    // ADMINISTRATIVO
    else if (user.rol === "personal_administrativo") {

        contenido = `
            <div class="card-option">
                <h3>📂 Expedientes</h3>
                <p>Administrar documentos.</p>
            </div>

            <div class="card-option">
                <h3>📦 Inventario</h3>
                <p>Control hospitalario.</p>
            </div>
        `;

    }

    res.send(`

    <!DOCTYPE html>
    <html lang="es">

    <head>

        <meta charset="UTF-8">

        <title>Dashboard HospiData</title>

        <style>

            body{
                margin:0;
                font-family:'Segoe UI';
                background:#eef2f3;
            }

            .navbar{
                background:#0f4c81;
                color:white;
                padding:20px;
                display:flex;
                justify-content:space-between;
                align-items:center;
            }

            .navbar h2{
                margin:0;
            }

            .logout{
                background:#ff4b2b;
                color:white;
                padding:10px 15px;
                border-radius:8px;
                text-decoration:none;
                font-weight:bold;
            }

            .container{
                padding:40px;
            }

            .welcome{
                background:white;
                padding:25px;
                border-radius:15px;
                box-shadow:0 5px 15px rgba(0,0,0,0.1);
                margin-bottom:30px;
            }

            .cards{
                display:grid;
                grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
                gap:20px;
            }

            .card-option{
                background:white;
                padding:25px;
                border-radius:15px;
                box-shadow:0 5px 15px rgba(0,0,0,0.1);
                transition:0.3s;
            }

            .card-option:hover{
                transform:translateY(-5px);
            }

            h3{
                color:#0f4c81;
            }

        </style>

    </head>

    <body>

        <div class="navbar">

            <h2>HospiData</h2>

            <a href="/logout" class="logout">
                Cerrar Sesión
            </a>

        </div>

        <div class="container">

            <div class="welcome">

                <h1>
                    Bienvenido, ${user.nombre}
                </h1>

                <p>
                    Rol:
                    <strong>
                        ${user.rol.replace("_"," ").toUpperCase()}
                    </strong>
                </p>

            </div>

            <div class="cards">

                ${contenido}

            </div>

        </div>

    </body>

    </html>

    `);

});


// ======================================
// CERRAR SESIÓN
// ======================================

app.get("/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect("/");

    });

});


// ======================================
// SERVIDOR
// ======================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`🚀 HospiData corriendo en puerto ${PORT}`);

});