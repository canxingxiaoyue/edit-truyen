import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { default: projectsHandler } = await import('./api/projects.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Chỉ quản lý lưu/mở Dự án & Thông tin truyện
app.all('/api/projects', async (req, res) => {
    try {
        await projectsHandler(req, res);
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