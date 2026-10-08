# Credenciales HN26 — sitio estático

El estudiante ingresa su **cédula** y luego el **nombre de su equipo**; si ambos coinciden, ve el correo y la contraseña de su equipo.

## Cómo funciona

- `tools/build_data.py` cruza el Excel de usuarios con un CSV `cedula,equipo` y genera `docs/data.json`.
- Cada participante queda cifrado con AES-GCM. La clave sale de `cédula + nombre de equipo` (PBKDF2, 200 000 iteraciones). El índice de búsqueda también es un hash de la cédula.
- En el repo **no** quedan cédulas, correos ni contraseñas en texto plano. El navegador descifra en el momento (Web Crypto).
- El nombre del equipo se compara sin mayúsculas, espacios ni tildes: `Guiri las con Cuajadá` = `guirilasconcuajada`.

```
docs/            ← lo que publica GitHub Pages
  index.html
  app.js
  data.json      ← generado, cifrado
tools/build_data.py
private/         ← en .gitignore, nunca se sube
  usuarios.xlsx
  participantes.csv
```

## Checklist

### 1. Datos
- [ ] Llenar `private/participantes.csv` con una fila por estudiante: `cedula,equipo`. En `equipo` va el mismo valor de la columna `NombreCompleto` del Excel (ej. `greentech`).
- [ ] Si el Excel cambia, copiarlo de nuevo a `private/usuarios.xlsx`.
- [ ] (Recomendado) Dar a cada equipo una contraseña distinta. Hoy las 85 cuentas usan la misma.

### 2. Generar `data.json`
```bash
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/build_data.py private/usuarios.xlsx private/participantes.csv
```
- [ ] Revisar el reporte: cantidad publicada y filas cuyo equipo no existe en el Excel.

### 3. Probar en local
```bash
python3 -m http.server 8765 --directory docs
```
- [ ] Abrir http://localhost:8765 y probar una cédula válida, una inválida y un equipo incorrecto.

### 4. Publicar en GitHub Pages
- [ ] Crear el repositorio (puede ser privado con GitHub Pro/Team; si es público, el `data.json` cifrado queda visible).
- [ ] `git init`, confirmar con `git status` que **no** aparece `private/` ni ningún `.xlsx`/`.csv`, y hacer push.
- [ ] En *Settings → Pages*: Source = *Deploy from a branch*, rama `main`, carpeta `/docs`.
- [ ] Abrir la URL `https://<usuario>.github.io/<repo>/` y repetir la prueba del paso 3.

### 5. Después del evento
- [ ] Desactivar Pages o borrar `docs/data.json`.
- [ ] Cambiar o deshabilitar las contraseñas de las cuentas.

## Límites (es un sitio estático)

- No hay límite de intentos. La protección es el costo de PBKDF2 y que hay que conocer cédula + equipo.
- Quien sepa la cédula y el equipo de alguien puede ver sus credenciales. Para algo más fuerte hace falta un backend (Azure Function, etc.).
- Los correos siguen el patrón `<equipo>.hnkronox@tecnacional.edu.ni`; con la contraseña compartida, conocer un nombre de equipo basta para entrar a esa cuenta. Por eso conviene la contraseña por equipo.
