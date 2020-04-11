class ConversationIDBStorage {
  constructor() {}

  async initialize() {
    const request = window.indexedDB.open('fbchatviewer', 1);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = e => this._initDb(e);
      request.onerror = () => reject('Failed to open IDB');
    });
  }

  _initDb(e) {
    const db = e.target.result;
    const metadataStore = db.createObjectStore('conversation', { keyPath: 'id' });
  }

  /*
    Storage access methods
  */
  async addConversation(conversation) {
    const transaction = this.db.transaction('conversation', 'readwrite');
    transaction.oncomplete = e => console.log('addConversation success');
    transaction.onerror = e => console.log('addConversation failed with: ' + e.target.errorCode);

    const store = transaction.objectStore('conversation');
    return new Promise((resolve, reject) => {
      const request = store.put(conversation);
      request.onsuccess = () => resolve();
      request.onerror = e => reject(e.target.errorCode);
    });
  }

  async removeConversation(id) {
    const transaction = this.db.transaction('conversation', 'readwrite');
    transaction.oncomplete = e => console.log('removeConversation success');
    transaction.onerror = e => console.log('removeConversation failed with: ' + e.target.errorCode);

    const store = transaction.objectStore('conversation');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = e => reject(e.target.errorCode);
    });
  }

  async getConversationIds() {
    const transaction = this.db.transaction('conversation', 'readonly');
    transaction.oncomplete = e => console.log('getConversationIds success');
    transaction.onerror = e => console.log('getConversationIds failed with: ' + e.target.errorCode);

    const metadataStore = transaction.objectStore('conversation');
    return new Promise((resolve, reject) => {
      let ids = [];
      let request = metadataStore.openKeyCursor();

      request.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          ids.push(cursor.key);
          cursor.continue();
        } else {
          resolve(ids);
        }
      };
      request.onerror = e => reject(e.target.errorCode);
    });
  }

  async getConversation(id) {
    const transaction = this.db.transaction('conversation', 'readonly');
    transaction.oncomplete = e => console.log('getConversation success');
    transaction.onerror = e => console.log('getConversation failed with: ' + e.target.errorCode);

    const store = transaction.objectStore('conversation');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = e => resolve(e.target.result);
      request.onerror = e => reject(e.target.errorCode);
    });
  }
}
