(() => {
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  const normCedula = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normEquipo = (v) =>
    v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

  let data = null;
  let cedula = null;
  let entry = null;

  async function loadData() {
    if (!data) {
      const res = await fetch("data.json", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo cargar la base de datos.");
      data = await res.json();
    }
    return data;
  }

  async function pbkdf2(secret, salt, usage) {
    const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits", "deriveKey"]);
    const params = { name: "PBKDF2", hash: "SHA-256", salt, iterations: data.iterations };
    if (usage === "bits") return new Uint8Array(await crypto.subtle.deriveBits(params, base, 256));
    return crypto.subtle.deriveKey(params, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  function busy(form, on) {
    form.querySelector("button[type=submit]").disabled = on;
  }

  function show(which) {
    $("f-cedula").hidden = which !== "cedula";
    $("f-equipo").hidden = which !== "equipo";
    $("resultado").hidden = which !== "resultado";
    const focus = { cedula: "cedula", equipo: "equipo" }[which];
    if (focus) $(focus).focus();
  }

  function reset() {
    cedula = entry = null;
    $("cedula").value = $("equipo").value = "";
    $("e-cedula").textContent = $("e-equipo").textContent = "";
    ["r-equipo", "r-correo", "r-pass"].forEach((id) => ($(id).textContent = ""));
    show("cedula");
  }

  $("f-cedula").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    $("e-cedula").textContent = "";
    const value = normCedula($("cedula").value);
    if (value.length < 6) {
      $("e-cedula").textContent = "Ingresa un número de cédula válido.";
      return;
    }
    busy(form, true);
    try {
      await loadData();
      const id = hex(await pbkdf2(value, fromB64(data.saltId), "bits")).slice(0, 32);
      const found = data.entries[id];
      if (!found) {
        $("e-cedula").textContent = "Esta cédula no está registrada. Consulta con el equipo organizador.";
        return;
      }
      cedula = value;
      entry = found;
      show("equipo");
    } catch (err) {
      $("e-cedula").textContent = err.message || "Ocurrió un error. Intenta de nuevo.";
    } finally {
      busy(form, false);
    }
  });

  $("f-equipo").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    $("e-equipo").textContent = "";
    const equipo = normEquipo($("equipo").value);
    if (!equipo) return;
    busy(form, true);
    try {
      const key = await pbkdf2(`${cedula}|${equipo}`, fromB64(data.saltKey), "key");
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(entry.iv) }, key, fromB64(entry.ct));
      const cred = JSON.parse(new TextDecoder().decode(plain));
      $("r-equipo").textContent = cred.equipo;
      $("r-correo").textContent = cred.correo;
      $("r-pass").textContent = cred.contrasena;
      show("resultado");
    } catch {
      $("e-equipo").textContent = "El nombre del equipo no coincide. Revisa e intenta de nuevo.";
    } finally {
      busy(form, false);
    }
  });

  document.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", reset));

  document.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($(b.dataset.copy).textContent);
        b.textContent = "Copiado";
        setTimeout(() => (b.textContent = "Copiar"), 1500);
      } catch {
        b.textContent = "Selecciona y copia";
      }
    })
  );
})();
