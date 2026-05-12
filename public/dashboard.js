fetch("/user")
.then(res => res.json())
.then(data => {

    document.getElementById("nombreUsuario").innerText = data.nombre;

    document.getElementById("rolUsuario").innerText = data.rol;

});