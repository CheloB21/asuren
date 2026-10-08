"""Genera docs/data.json cifrado a partir del Excel de usuarios y el CSV de participantes.

Uso:
    python tools/build_data.py private/usuarios.xlsx private/participantes.csv

- usuarios.xlsx: columnas NombreCompleto (nombre del equipo), Correo, Contrasena
- participantes.csv: columnas cedula,equipo (equipo = mismo valor que NombreCompleto)

Cada participante queda como una entrada indexada por un hash de su cédula y
cifrada con AES-GCM usando una clave derivada de cédula + nombre de equipo.
El JSON publicado no contiene cédulas, correos ni contraseñas en texto plano.
"""
import base64
import csv
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITERATIONS = 200_000
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data.json"


def norm_cedula(value):
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def norm_equipo(value):
    text = unicodedata.normalize("NFD", str(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", text.lower())


def pbkdf2(secret, salt):
    return hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, ITERATIONS, 32)


def b64(data):
    return base64.b64encode(data).decode()


def load_usuarios(path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() for h in next(rows)]
    idx = {name: header.index(name) for name in ("NombreCompleto", "Correo", "Contrasena")}
    usuarios = {}
    for row in rows:
        if not row or row[idx["NombreCompleto"]] is None:
            continue
        usuarios[norm_equipo(row[idx["NombreCompleto"]])] = {
            "equipo": str(row[idx["NombreCompleto"]]).strip(),
            "correo": str(row[idx["Correo"]]).strip(),
            "contrasena": str(row[idx["Contrasena"]]).strip(),
        }
    return usuarios


def load_participantes(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            cedula, equipo = row.get("cedula", ""), row.get("equipo", "")
            if cedula.strip() and equipo.strip():
                yield norm_cedula(cedula), norm_equipo(equipo)


def main(xlsx, csv_path):
    usuarios = load_usuarios(xlsx)
    salt_id, salt_key = os.urandom(16), os.urandom(16)
    entries, sin_equipo, vistos = {}, [], set()

    for cedula, equipo in load_participantes(csv_path):
        if equipo not in usuarios:
            sin_equipo.append((cedula[-4:], equipo))
            continue
        if cedula in vistos:
            print(f"  ! cédula duplicada (…{cedula[-4:]}), se usa la última fila")
        vistos.add(cedula)
        entry_id = pbkdf2(cedula, salt_id).hex()[:32]
        key = pbkdf2(f"{cedula}|{equipo}", salt_key)
        iv = os.urandom(12)
        payload = json.dumps(usuarios[equipo], ensure_ascii=False).encode()
        entries[entry_id] = {"iv": b64(iv), "ct": b64(AESGCM(key).encrypt(iv, payload, None))}

    OUT.write_text(json.dumps({
        "v": 1,
        "iterations": ITERATIONS,
        "saltId": b64(salt_id),
        "saltKey": b64(salt_key),
        "entries": entries,
    }, separators=(",", ":")))

    print(f"Equipos en Excel: {len(usuarios)}")
    print(f"Participantes publicados: {len(entries)} -> {OUT.relative_to(ROOT)}")
    if sin_equipo:
        print(f"Filas con equipo que no existe en el Excel ({len(sin_equipo)}):")
        for tail, equipo in sin_equipo:
            print(f"  cédula …{tail}: '{equipo}'")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
