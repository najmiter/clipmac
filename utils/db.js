const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;
let currentMaxHistoryLength;

function initDB(userDataPath, maxHistoryLength) {
  currentMaxHistoryLength = maxHistoryLength;
  const dbPath = path.join(userDataPath, 'clipboard_history.db');
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
      } else {
        db.run(
          `CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT UNIQUE,
            timestamp INTEGER,
            title TEXT,
            description TEXT,
            tags TEXT
          )`,
          (tableErr) => {
            if (tableErr) {
              reject(tableErr);
            } else {
              db.run(`ALTER TABLE history ADD COLUMN title TEXT`, () => {});
              db.run(
                `ALTER TABLE history ADD COLUMN description TEXT`,
                () => {}
              );
              db.run(`ALTER TABLE history ADD COLUMN tags TEXT`, () => {});
              resolve();
            }
          }
        );
      }
    });
  });
}

function fetchHistoryFromDB(callback, page = 1, limit = null) {
  if (!db) {
    const err = new Error('Database not initialized.');
    if (callback) callback(err, [], { total: 0, page: 1, hasMore: false });
    return;
  }

  const actualLimit = limit || currentMaxHistoryLength;
  const offset = (page - 1) * actualLimit;

  db.get('SELECT COUNT(*) as total FROM history', (countErr, countRow) => {
    if (countErr) {
      if (callback)
        callback(countErr, [], { total: 0, page: 1, hasMore: false });
      return;
    }

    const total = countRow.total;
    const hasMore = offset + actualLimit < total;

    db.all(
      'SELECT text, timestamp, title, description, tags FROM history ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [actualLimit, offset],
      (err, rows) => {
        if (err) {
          if (callback)
            callback(err, [], { total: 0, page: 1, hasMore: false });
          return;
        }
        const processedRows = rows
          ? rows.map((row) => ({
              ...row,
              tags: row.tags ? JSON.parse(row.tags) : [],
            }))
          : [];

        const paginationInfo = {
          total,
          page,
          hasMore,
          totalPages: Math.ceil(total / actualLimit),
        };

        if (callback) callback(null, processedRows, paginationInfo);
      }
    );
  });
}

function addTextToHistoryDB(text, options = {}, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (!db) {
    const err = new Error('Database not initialized.');

    if (callback) fetchHistoryFromDB(callback);
    return;
  }
  if (!text || text.trim() === '') {
    if (callback) fetchHistoryFromDB(callback);
    return;
  }

  const { title = null, description = null, tags = [] } = options;
  const timestamp = Date.now();
  const tagsJson = JSON.stringify(tags);

  db.serialize(() => {
    db.run(`DELETE FROM history WHERE text = ?`, [text], (delErr) => {
      if (delErr) {
      }
      db.run(
        `INSERT INTO history (text, timestamp, title, description, tags) VALUES (?, ?, ?, ?, ?)`,
        [text, timestamp, title, description, tagsJson],
        (insErr) => {
          if (insErr) {
            fetchHistoryFromDB(callback);
            return;
          }
          fetchHistoryFromDB(callback);
        }
      );
    });
  });
}

function searchHistoryInDB(query, callback, page = 1, limit = 50) {
  if (!db) {
    const err = new Error('Database not initialized.');
    if (callback) callback(err, [], { total: 0, page: 1, hasMore: false });
    return;
  }

  if (!query || query.trim() === '') {
    fetchHistoryFromDB(callback, page, limit);
    return;
  }

  const searchTerm = `%${query}%`;
  const offset = (page - 1) * limit;

  db.get(
    `SELECT COUNT(*) as total FROM history 
     WHERE LOWER(text) LIKE LOWER(?) 
        OR LOWER(title) LIKE LOWER(?)
        OR LOWER(description) LIKE LOWER(?)
        OR LOWER(tags) LIKE LOWER(?)`,
    [searchTerm, searchTerm, searchTerm, searchTerm],
    (countErr, countRow) => {
      if (countErr) {
        if (callback)
          callback(countErr, [], { total: 0, page: 1, hasMore: false });
        return;
      }

      const total = countRow.total;
      const hasMore = offset + limit < total;

      db.all(
        `SELECT text, timestamp, title, description, tags FROM history 
         WHERE LOWER(text) LIKE LOWER(?) 
            OR LOWER(title) LIKE LOWER(?)
            OR LOWER(description) LIKE LOWER(?)
            OR LOWER(tags) LIKE LOWER(?)
         ORDER BY timestamp DESC 
         LIMIT ? OFFSET ?`,
        [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset],
        (err, rows) => {
          if (err) {
            if (callback)
              callback(err, [], { total: 0, page: 1, hasMore: false });
            return;
          }
          const processedRows = rows
            ? rows.map((row) => ({
                ...row,
                tags: row.tags ? JSON.parse(row.tags) : [],
              }))
            : [];

          const paginationInfo = {
            total,
            page,
            hasMore,
            totalPages: Math.ceil(total / limit),
          };

          if (callback) callback(null, processedRows, paginationInfo);
        }
      );
    }
  );
}

function clearHistoryDB(callback) {
  if (!db) {
    const err = new Error('Database not initialized.');
    if (callback) callback(err);
    return;
  }
  db.run('DELETE FROM history', (err) => {
    if (err) {
      if (callback) callback(err);
      return;
    }
    if (callback) callback(null);
  });
}

function closeDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

function updateHistoryEntryDB(updatedEntry, callback) {
  if (!db) {
    const err = new Error('Database not initialized.');
    if (callback) callback(err, []);
    return;
  }

  const { text, title, description, tags } = updatedEntry;
  const tagsJson = JSON.stringify(tags || []);

  db.run(
    `UPDATE history SET title = ?, description = ?, tags = ? WHERE text = ?`,
    [title, description, tagsJson, text],
    function (err) {
      if (err) {
        console.error('Error updating history entry:', err.message);
        if (callback) callback(err, []);
        return;
      }

      fetchHistoryFromDB(callback);
    }
  );
}

module.exports = {
  initDB,
  fetchHistoryFromDB,
  addTextToHistoryDB,
  searchHistoryInDB,
  clearHistoryDB,
  closeDB,
  updateHistoryEntryDB,
};
