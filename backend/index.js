const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'admin123',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'centro_cultural',
});


pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('[-] Error inicial al conectar con PostgreSQL:', err.message);
  } else {
    console.log('[+] Conexión exitosa a PostgreSQL establecida correctamente.');
  }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Servidor activo y listo.' });
});

app.get('/api/visitantes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, correo, categoria_entrada, fecha_registro FROM visitantes ORDER BY fecha_registro DESC'
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('[-] Error al obtener visitantes:', error.message);
    return res.status(500).json({
      mensaje: 'Error interno al obtener los visitantes de la base de datos.'
    });
  }
});

app.post('/api/visitantes', async (req, res) => {
  const { nombre, correo, categoria_entrada } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ mensaje: 'El campo nombre es obligatorio.' });
  }
  if (!correo || !correo.trim()) {
    return res.status(400).json({ mensaje: 'El campo correo es obligatorio.' });
  }
  if (!categoria_entrada) {
    return res.status(400).json({ mensaje: 'El campo categoria_entrada es obligatorio.' });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(correo.trim())) {
    return res.status(400).json({ mensaje: 'El formato de correo electrónico no es válido.' });
  }

  try {
    const queryText = `
      INSERT INTO visitantes (nombre, correo, categoria_entrada)
      VALUES ($1, $2, $3)
      RETURNING id, nombre, correo, categoria_entrada, fecha_registro
    `;
    const values = [nombre.trim(), correo.trim(), categoria_entrada];
    const result = await pool.query(queryText, values);

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[-] Error al registrar visitante:', error.message);

    if (error.code === '23505') {
      return res.status(400).json({
        mensaje: 'Este correo electrónico ya se encuentra registrado.'
      });
    }

    return res.status(500).json({
      mensaje: 'Error interno del servidor al intentar registrar al visitante.'
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ mensaje: 'Ruta no encontrada.' });
});

app.listen(PORT, () => {
  console.log(`[+] Servidor corriendo en el puerto ${PORT}`);
});
