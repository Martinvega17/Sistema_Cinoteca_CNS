import { neon } from '@neondatabase/serverless';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
    console.log('🔍 Verificando conexión a la base de datos...');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('❌ Error: La variable de entorno DATABASE_URL no está definida.');
        process.exit(1);
    }

    const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
    console.log(`📂 Leyendo esquema desde: ${schemaPath}`);

    let sqlScript;
    try {
        sqlScript = await fs.readFile(schemaPath, 'utf-8');
        console.log(`✅ Archivo de esquema leído (${sqlScript.length} caracteres)`);
    } catch (error) {
        console.error(`❌ Error al leer el archivo de esquema: ${error.message}`);
        process.exit(1);
    }

    const sql = neon(databaseUrl);

    try {
        console.log('🚀 Ejecutando migraciones...');

        const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);
        console.log(`📝 Ejecutando ${statements.length} sentencias SQL...`);

        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i].trim();
            if (stmt) {
                try {
                    await sql.query(stmt);
                    console.log(`✅ Sentencia ${i + 1}/${statements.length} ejecutada`);
                } catch (stmtError) {
                    // Mostrar la sentencia que falla para depurar
                    console.error(`❌ Error en sentencia ${i + 1}:`);
                    console.error(`📄 Sentencia problemática:`);
                    console.error(stmt.substring(0, 200) + (stmt.length > 200 ? '...' : ''));
                    console.error(`❌ Error: ${stmtError.message}`);
                    throw stmtError;
                }
            }
        }

        console.log('✅ Migraciones completadas con éxito.');
    } catch (error) {
        console.error(`❌ Error durante la migración: ${error.message}`);
        process.exit(1);
    }
}

if (process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_ENV) {
    runMigrations();
} else {
    console.log(`⏭️ Saltando migraciones en entorno: ${process.env.VERCEL_ENV || 'desarrollo'}`);
    process.exit(0);
}