/*
  Controller
*/
class Controller {
  constructor(storage, viewer) {
    this.profilePictures = new ProfilePictures();
    this.storage = storage;
    this.viewer = viewer;

    this.overlay = document.querySelector('#overlay');
    this.conversationList = document.querySelector('#conversation-list');
    this.emptyMessage = document.querySelector('#conversation-list-empty');
    this.participantsContainer = document.querySelector('#participants');
    this.participantList = document.querySelector('#participant-list');
    this.participants = {};

    window.onbeforeunload = e => {
      this.persistViewerState();
    };
  }

  async initialize() {
    // Initialize conversation list
    const ids = await this.storage.getConversationIds();
    if (ids.length === 0) {
      this.displayNone();
    } else {
      for (const id of ids) { // Fill the list of items
        const conversation = await this.storage.getConversation(id);
        this.addListItem(conversation);
        this.addParticipants(conversation);
      }
      this.displayCurrentOrFirst();
    }

    // Initialize file input
    const customFileInput = document.querySelector('#custom-file-input');
    const nativeFileInput = document.querySelector('#native-file-input');
    const overlay = document.querySelector('#overlay');

    customFileInput.addEventListener('click', () => {
      nativeFileInput.value = null;
      nativeFileInput.click();
    });
    nativeFileInput.addEventListener('input', async () => {
      this.showOverlay('Loading...');
      try {
        const conversation = await parseInputFile(nativeFileInput);
        this.addConversation(conversation);
        this.hideOverlay(overlay);
      } catch (e) {
        this.hideOverlay(overlay);
        this.showOverlay('Error loading file');
        setTimeout(this.hideOverlay, 3000);
      }
    });
  }

  async addConversation(conversation) {
    await this.storage.addConversation(conversation);
    if (this.getListItem(conversation.id)) { // delete conversation state if updating
      this.deleteConversationState(conversation.id);
    }
    this.addListItem(conversation);
    this.addParticipants(conversation);
    this.display(conversation.id);
  }

  async removeConversation(id) {
    await this.storage.removeConversation(id);
    this.deleteConversationState(id);

    if (this.getCurrentlyDisplayed() === id) {
      this.displayFirst();
    }
  }

  deleteConversationState(id) {
    this.removeListItem(id);
    this.deleteParticipants(id);
    this.deleteViewerState(id);
    this.viewer.notifyDeleted(id);
  }

  display(id) {
    this.setCurrentlyDisplayed(id);
    this.setSelectedConversation(id);
    this.showParticipants(id);
    this.hideEmptyMessage();

    const state = this.getViewerState(id);
    this.viewer.display(id, state);
  }

  displayCurrentOrFirst() {
    // Display current conversation, or first conversation if it doesn't exist
    const currentlyDisplayed = this.getCurrentlyDisplayed();
    if (currentlyDisplayed) {
      this.display(currentlyDisplayed);
    } else {
      this.displayFirst();
    }
  }

  displayFirst() {
    const firstItem = this.getFirstListItem();
    if (firstItem) {
      const id = firstItem.getAttribute('id');
      this.display(id);
    } else {
      this.displayNone();
    }
  }

  displayNone() {
    this.clearCurrentlyDisplayed();

    this.hideParticipants();
    this.showEmptyMessage();

    this.viewer.displayNone();
  }

  addParticipants(conversation) {
    this.participants[conversation.id] = getParticipants(conversation);
  }

  deleteParticipants(id) {
    delete this.participants[id];
  }

  showParticipants(id) {
    this.clearParticipants();

    for (const p of this.participants[id]) {
      this.participantList.appendChild(this.createParticipantItem(p));
    }

    this.participantsContainer.style.display = 'block';
  }

  clearParticipants() {
    while (this.participantList.firstChild) {
      this.participantList.removeChild(this.participantList.firstChild);
    }
  }

  hideParticipants() {
    this.participantsContainer.style.display = 'none';
  }

  /*
    DOM methods
  */

  /* Conversation list */

  addListItem(conversation) {
    const listItem = this.createListItem(conversation);
    this.conversationList.appendChild(listItem);
  }

  removeListItem(id) {
    const item = this.getListItem(id);
    this.conversationList.removeChild(item);
  }

  setSelectedConversation(id) {
    const currentItem = document.querySelector(".selected");
    if (currentItem) {
      currentItem.classList.remove("selected");
    }
    this.getListItem(id).classList.add("selected");
  }

  getListItem(id) {
    return document.querySelector('#' + id);
  }

  getFirstListItem() {
    return document.querySelector('#conversation-list .conversation-list-item');
  }

  createListItem(conversation) {
    const container = document.createElement('div');
    container.setAttribute('id', conversation.id);
    container.setAttribute('class', 'conversation-list-item');

    const displayButton = document.createElement('button');
    const exitButton = document.createElement('button');

    const displayButtonLabel = document.createElement('span');
    displayButtonLabel.textContent = conversation.title;

    displayButton.setAttribute('type', 'button');
    displayButton.setAttribute('class', 'conversation');
    displayButton.appendChild(displayButtonLabel);

    displayButton.addEventListener('click', e => {
      this.display(conversation.id);
      displayButton.blur();
    });

    exitButton.setAttribute('type', 'button');
    exitButton.setAttribute('class', 'exit');
    exitButton.textContent = 'X';

    exitButton.addEventListener('click', e => {
      this.removeConversation(conversation.id);
    });

    container.appendChild(displayButton);
    container.appendChild(exitButton);
    return container;
  }

  /* Participants */

  createParticipantItem(participant) {
    const item = document.createElement('li');
    const profilePicture = this.profilePictures.getPicture(participant);
    const text = document.createTextNode(participant);

    item.appendChild(profilePicture);
    item.appendChild(text);

    return item;
  }

  /*
    Show or hide the empty file list message
  */

  showEmptyMessage() {
    this.emptyMessage.style.display = 'block';
  }

  hideEmptyMessage() {
    this.emptyMessage.style.display = 'none';
  }

  /* Currently displayed conversation */

  getCurrentlyDisplayed() {
    return localStorage.getItem('currentlyDisplayed');
  }

  setCurrentlyDisplayed(id) {
    return localStorage.setItem('currentlyDisplayed', id);
  }

  clearCurrentlyDisplayed() {
    localStorage.removeItem('currentlyDisplayed');
  }

  /* Overlay showing / hiding */

  showOverlay(message) {
    this.overlay.querySelector('p').textContent = message;
    this.overlay.classList.toggle('visible');
    this.overlay.classList.toggle('opaque');
  }

  hideOverlay() {
    setTimeout(() => {
      this.overlay.classList.toggle('opaque');
      setTimeout(() => this.overlay.classList.toggle('visible'), 500); // hacky but necessary
    }, 200);
  }

  /* Viewer state methods */

  persistViewerState() {
    const state = this.viewer.getState();
    if (state) {
      for (const id in state) {
        localStorage.setItem(id, state[id]);
      }
    }
  }

  getViewerState(id) {
    return localStorage.getItem(id);
  }

  deleteViewerState(id) {
    localStorage.removeItem(id);
  }
}
