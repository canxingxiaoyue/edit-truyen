import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // 1. GET: LẤY DANH SÁCH DỰ ÁN
        if (req.method === 'GET') {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'Thiếu userId' });

            const { rows } = await sql`
                SELECT id, name, chapter_title as "chapterTitle", story_title as "storyTitle", row_count as "rowCount", size, data, updated_at as "updatedAt"
                FROM projects 
                WHERE user_id = ${String(userId)} 
                ORDER BY updated_at DESC
            `;
            return res.status(200).json({ success: true, data: rows });
        }

        // 2. POST: TẠO MỚI HOẶC CẬP NHẬT DỰ ÁN
        if (req.method === 'POST') {
            const { id, userId, name, chapterTitle, storyTitle, rowCount, size, data, updatedAt } = req.body;

            if (!id || !userId) return res.status(400).json({ error: 'Thiếu id hoặc userId' });

            const jsonData = typeof data === 'string' ? data : JSON.stringify(data || []);
            // TRUYỀN SỐ MILIGIÂY (BIGINT) PHÙ HỢP VỚI KIỂU DỮ LIỆU CỦA BẢNG
            const ts = Number(updatedAt || Date.now());

            await sql`
                INSERT INTO projects (id, user_id, name, chapter_title, story_title, row_count, size, data, updated_at)
                VALUES (
                    ${String(id)}, 
                    ${String(userId)}, 
                    ${String(name || '')}, 
                    ${String(chapterTitle || '')}, 
                    ${String(storyTitle || '')}, 
                    ${Number(rowCount) || 0}, 
                    ${Number(size) || 0}, 
                    ${jsonData}::jsonb, 
                    ${ts}
                )
                ON CONFLICT (id) 
                DO UPDATE SET 
                    name = EXCLUDED.name,
                    chapter_title = EXCLUDED.chapter_title,
                    story_title = EXCLUDED.story_title,
                    row_count = EXCLUDED.row_count,
                    size = EXCLUDED.size,
                    data = EXCLUDED.data,
                    updated_at = EXCLUDED.updated_at;
            `;
            
            return res.status(200).json({ success: true, message: 'Saved to Postgres' });
        }

        // 3. DELETE: XÓA DỰ ÁN
        if (req.method === 'DELETE') {
            const { id, user_id } = req.query;
            
            if (!id || !user_id) return res.status(400).json({ error: 'Thiếu id hoặc user_id' });

            await sql`
                DELETE FROM projects 
                WHERE id = ${String(id)} AND user_id = ${String(user_id)}
            `;
            
            return res.status(200).json({ success: true, message: 'Deleted from Postgres' });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });

    } catch (error) {
        console.error("🔴 LỖI DATABASE:", error);
        return res.status(500).json({ error: error.message || String(error) });
    }
}