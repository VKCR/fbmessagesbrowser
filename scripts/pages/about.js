const storage = new ConversationIDBStorage();
const viewer = new DummyViewer();
const controller = new Controller(storage, viewer);
storage.initialize().then(() => controller.initialize());
