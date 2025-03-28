const sqlite3 = require('sqlite3');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const ID3 = require('node-id3');

// 清理文件名中的非法字符
function sanitizeFileName(name) {
    return (name || 'Unknown')
        .replace(/[/\\?%*:|"<>]/g, '')
        .trim() || 'Untitled';
}

async function main() {
    try {
        // 连接数据库
        const db = new sqlite3.Database('./cloud.db');
        const query = promisify(db.all.bind(db));
        
        // 查询数据库记录
        const rows = await query(`
            SELECT title, artist, album, format, file 
            FROM musicResource
        `);
        db.close();

        // 创建文件名映射表
        const fileMap = new Map();
        for (const row of rows) {
            fileMap.set(row.file, {
                title: row.title,
                artist: row.artist,
                album: row.album,
                format: row.format
            });
        }

        // 处理Music目录
        const musicDir = path.join(__dirname, 'Music');
        const files = await fs.readdir(musicDir);

        for (const file of files) {
            const record = fileMap.get(file);
            if (!record) {
                console.log(`跳过未匹配文件: ${file}`);
                continue;
            }

            // 生成新文件名
            const artist = sanitizeFileName(record.artist);
            const title = sanitizeFileName(record.title);
            let newName = `${artist} - ${title}.${record.format}`;
            
            // 处理文件名冲突
            let counter = 0;
            let finalName = newName;
            while (true) {
                const targetPath = path.join(musicDir, finalName);
                try {
                    await fs.access(targetPath);
                    counter++;
                    finalName = `${artist} - ${title}-${counter}.${record.format}`;
                } catch (err) {
                    if (err.code === 'ENOENT') break;
                    throw err;
                }
            }

            // 执行重命名
            const oldPath = path.join(musicDir, file);
            const newPath = path.join(musicDir, finalName);
            await fs.rename(oldPath, newPath);
            console.log(`重命名成功: ${file} → ${finalName}`);

            // 仅处理MP3文件
            if (path.extname(finalName).toLowerCase() === '.mp3') {
                try {
                    ID3.update({
                        title: record.title,
                        artist: record.artist,
                        album: record.album
                    }, newPath);
                    console.log(`  → 更新MP3元数据成功`);
                } catch (err) {
                    console.error(`  → MP3元数据更新失败: ${err.message}`);
                }
            }
        }
    } catch (err) {
        console.error('处理过程中发生错误:', err);
    }
}

main();