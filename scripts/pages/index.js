const storage = new ConversationIDBStorage();
const viewer = new ConversationViewer(storage);
const controller = new Controller(storage, viewer);
storage.initialize().then(() => controller.initialize());
