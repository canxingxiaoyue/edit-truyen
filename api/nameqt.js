import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // 1. GET: LẤY TẤT CẢ FILE NAME QT CỦA USER
        if (req.method === 'GET') {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'Thiếu userId' });

            const { rows } = await sql`
                SELECT id, file_name as "fileName", content, count, updated_at as "updatedAt"
                FROM nameqt_files 
                WHERE user_id = ${String(userId)} 
                ORDER BY updated_at DESC
            `;
            return res.status(200).json({ success: true, data: rows });
        }

        // 2. POST: LƯU HOẶC CẬP NHẬT FILE NAME QT
        if (req.method === 'POST') {
            const { id, userId, fileName, content, count, updatedAt } = req.body;
            if (!id || !userId) return res.status(400).json({ error: 'Thiếu id hoặc userId' });

            const ts = Number(updatedAt || Date.now());

            await sql`
                INSERT INTO nameqt_files (id, user_id, file_name, content, count, updated_at)
                VALUES (${String(id)}, ${String(userId)}, ${String(fileName || 'Name_QT.txt')}, ${String(content || '')}, ${Number(count) || 0}, ${ts})
                ON CONFLICT (id) 
                DO UPDATE SET 
                    file_name = EXCLUDED.file_name,
                    content = EXCLUDED.content,
                    count = EXCLUDED.count,
                    updated_at = EXCLUDED.updated_at;
            `;
            return res.status(200).json({ success: true, message: 'Saved Name QT' });
        }

        // 3. DELETE: XÓA FILE NAME QT
        if (req.method === 'DELETE') {
            const { id, user_id } = req.query;
            if (!id || !user_id) return res.status(400).json({ error: 'Thiếu id hoặc user_id' });

            await sql`
                DELETE FROM nameqt_files 
                WHERE id = ${String(id)} AND user_id = ${String(user_id)}
            `;
            return res.status(200).json({ success: true, message: 'Deleted Name QT' });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error("🔴 LỖI NAME QT DB:", error);
        return res.status(500).json({ error: error.message || String(error) });
    }
}