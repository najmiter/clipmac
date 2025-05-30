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
        // console.log('Connected to the SQLite database.');
        db.run(
          `CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT UNIQUE,
            timestamp INTEGER
          )`,
          (tableErr) => {
            if (tableErr) {
              // console.error('Error creating table', tableErr.message);
              reject(tableErr);
            } else {
              resolve();
            }
          }
        );
      }
    });
  });
}

function fetchHistoryFromDB(callback) {
  if (!db) {
    const err = new Error('Database not initialized.');
    // console.error(err.message);
    if (callback) callback(err, []);
    return;
  }
  db.all(
    'SELECT text, timestamp FROM history ORDER BY timestamp DESC LIMIT ?',
    [currentMaxHistoryLength],
    (err, rows) => {
      if (err) {
        // console.error('Error fetching history from DB', err.message);
        if (callback) callback(err, []);
        return;
      }
      if (callback) callback(null, rows || []);
    }
  );
}

function addTextToHistoryDB(text, callback) {
  if (!db) {
    const err = new Error('Database not initialized.');
    // console.error(err.message);
    if (callback) fetchHistoryFromDB(callback);
    return;
  }
  if (!text || text.trim() === '') {
    if (callback) fetchHistoryFromDB(callback);
    return;
  }
  const timestamp = Date.now();
  db.serialize(() => {
    db.run(`DELETE FROM history WHERE text = ?`, [text], (delErr) => {
      if (delErr) {
        // console.warn(
        //   'Error deleting existing text from DB (or text not found):',
        //   delErr.message
        // );
      }
      db.run(
        `INSERT INTO history (text, timestamp) VALUES (?, ?)`,
        [text, timestamp],
        (insErr) => {
          if (insErr) {
            // console.error('Error inserting text to DB:', insErr.message);
            fetchHistoryFromDB(callback);
            return;
          }
          db.run(
            `
            DELETE FROM history
            WHERE id NOT IN (
              SELECT id
              FROM history
              ORDER BY timestamp DESC
              LIMIT ?
            )
          `,
            [currentMaxHistoryLength],
            (trimErr) => {
              if (trimErr) {
                // console.error('Error trimming DB history:', trimErr.message);
              }
              fetchHistoryFromDB(callback);
            }
          );
        }
      );
    });
  });
}

function searchHistoryInDB(query, callback) {
  if (!db) {
    const err = new Error('Database not initialized.');
    if (callback) callback(err, []);
    return;
  }

  if (!query || query.trim() === '') {
    fetchHistoryFromDB(callback);
    return;
  }

  const searchTerm = `%${query}%`;
  db.all(
    `SELECT text, timestamp FROM history 
     WHERE LOWER(text) LIKE LOWER(?) 
     ORDER BY timestamp DESC 
     LIMIT ?`,
    [searchTerm, currentMaxHistoryLength],
    (err, rows) => {
      if (err) {
        // console.error('Error searching history in DB', err.message);
        if (callback) callback(err, []);
        return;
      }
      if (callback) callback(null, rows || []);
    }
  );
}

function closeDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          // console.error('Error closing database', err.message);
          reject(err);
        } else {
          // console.log('Database connection closed.');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  initDB,
  fetchHistoryFromDB,
  addTextToHistoryDB,
  searchHistoryInDB,
  closeDB,
};
