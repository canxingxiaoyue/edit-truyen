import express from 'express';
import dotenv from 'dotenv';

// 1. NẠP BIẾN MÔI TRƯỜNG TỪ FILE .env.local ĐẦU TIÊN
dotenv.config({ path: '.env.local' });
dotenv.config();

// 2. IMPORT FILE API SAU KHI ĐÃ CÓ CHUỖI KẾT NỐI POSTGRES
const { default: handler } = await import('./api/projects.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// Chạy file giao diện tĩnh (HTML, CSS, JS)
app.use(express.static('.'));

// Chuyển tiếp Request API vào file api/projects.js
app.all('/api/projects', async (req, res) => {
    try {
        await handler(req, res);
    } catch (err) {
        console.error("Lỗi Server Local:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 SERVER ĐÃ SẴN SÀNG TẠI: http://localhost:${PORT}`);
    console.log(`👉 Mở trình duyệt gõ: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});