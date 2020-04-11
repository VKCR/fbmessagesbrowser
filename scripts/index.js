/*
  Function to parse input files
*/

async function parseInputFile(fileInput) {
  let jsons = [];
  let decoder = new Utf16Decoder();

  for (let i = 0; i < fileInput.files.length; i++) {
    const rawJson = await fileInput.files.item(i).text();
    const json = JSON.parse(decoder.decode(rawJson));
    jsons.push(json);
  }

  return getConversationFromJsons(jsons);
}

/*
  Regexp escape
*/

RegExp.escape= function(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

/*
  Decoder for the UTF encoding of downloaded FB conversations
*/
// TODO refactor
class Utf16Decoder {
  constructor() {}

  decode(inputStr) {
    let outputStr = '';
    let i = 0;
    while (i < inputStr.length - 1) {
      if (this._isUtfBloc(inputStr, i)) {
        let decodedStr = '%' + inputStr.slice(i + 4, i + 6);
        i += 6;
        while (this._isUtfBloc(inputStr, i)) {
          decodedStr += '%' + inputStr.slice(i + 4, i + 6);
          i += 6;
        }
        try {
          outputStr += decodeURIComponent(decodedStr);
        } catch(e) {
          console.log('Could not decode: ' + decodedStr);
        }
      } else {
        outputStr += inputStr[i];
        i++;
      }
    }
    outputStr += inputStr[inputStr.length - 1];
    return outputStr;
  }

  _isUtfBloc(str, i) {
    return str[i] === '\\' && str[i + 1] === 'u' && this._isHex(str.slice(i + 2, i + 6));
  }

  _isHex(str) {
    const reghex = /[0-9a-f]/;
    for (const i of str) {
      if (!i.match(reghex)) {
        return false;
      }
    }
    return true;
  }
}

/*
  Data Types conversions
*/

function getConversationFromJsons(jsons) {
  // TODO for now we do no verification about the integrity of the files: we assume they do all come from the same thread. We use the metadata of the first file for the whole thread.
  let catdMessages = [];
  jsons.sort((jsonA, jsonB) => { // sort newest to oldest
    return jsonA['messages'][0]['timestamp_ms'] < jsonB['messages'][0]['timestamp_ms'] ? 1 : -1;
  });

  for (const json of jsons) {
    const messages = json['messages'].map(message => {
      return {
        senderName: message['sender_name'],
        timestampMs: message['timestamp_ms'],
        content: message['content'],
        type: message['type']
      };
    });
    catdMessages = catdMessages.concat(messages);
  }

  const json = jsons[0];
  return {
    id: json['thread_path'].replace('/', '_'),
    title: json['title'],
    threadType: json['threadType'] || json['thread_type'],
    isStillParticipant: json['isStillParticipant'] || json['is_still_participant'],
    participants: json['participants'],
    messages: catdMessages
  };
}

function getParticipants(conversation) { // return unique participants
  let participants = [];
  for (const p of conversation.participants) {
    if (!participants.includes(p.name)) {
      participants.push(p.name);
    }
  }
  return participants;
}

function pad(x) {
  if (x < 10) {
    return '0' + x;
  } else {
    return x;
  }
}

function formatTimestamp(timestampMs, verbose = true) {
  let date = new Date(timestampMs);
  if (verbose) {
    return pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + '/' + date.getFullYear() + ' @ '
      + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  } else {
    return pad(date.getMonth() + 1) + '/' + date.getFullYear();
  }
}

/*
  Conversation viewers
*/

// Dummy viewer, does nothing
class DummyViewer {
  constructor() {}


  async display(conversationId) {}

  displayNone() {}

  notifyDeleted() {}

  getState() {
    return undefined;
  }
}

/*
  Profile pictures
  Right now picture is just a <span> element styled with CSS to display a circle of a random color with the capitalized white initial of the sender_name
*/

class ProfilePictures {
  constructor() {
    this.pictures = {};
  }

  getPicture(senderName) {
    if (senderName in this.pictures) {
      return this.pictures[senderName].cloneNode(true);
    } else {
      const picture = this._generatePicture(senderName);
      this.pictures[senderName] = picture;
      return picture;
    }
  }

  _generatePicture(senderName) {
    const initial = senderName.toUpperCase().slice(0,1);
    const color = hashColor(senderName);
    const picture = document.createElement('span');

    picture.setAttribute('class', 'profile-picture');
    picture.textContent = initial;
    picture.style.backgroundColor = color;

    return picture;
  }
}

/*
  Color utilities
*/

function hashColor(str) {
  // Taken from the internet
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  let hex = ((hash>>24)&0xFF).toString(16) +
      ((hash>>16)&0xFF).toString(16) +
      ((hash>>8)&0xFF).toString(16) +
      (hash&0xFF).toString(16);
  hex += '000000';
  return '#' + hex.substring(0, 6);
}

function hex2rgba(hex, alpha) {
  let r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);

  if (alpha) {
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  } else {
    return "rgb(" + r + ", " + g + ", " + b + ")";
  }
}
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
class AnalyticsViewer{
  constructor(storage) {
    this.storage = storage;
    this.viewer = document.querySelector('#analytics-viewer');
    this.instructions = document.querySelector('#instructions');
    this.graphs = {};
  }

  /* Public methods */

  async display(id) {
    this.hideInstructions();
    this.showViewer();

    const conversation = await this.storage.getConversation(id);

    this.displayMessageCountGraph(conversation);
    this.displayActivityGraph(conversation);
    this.displayWordCountGraph(conversation);
  }

  displayNone() {
    this.hideViewer();
    this.showInstructions();
  }

  notifyDeleted(id) {
    // do nothing
  }

  getState() {
    return undefined;
  }

  /* General methods */

  displayMessageCountGraph(conversation) {
    const participants = getParticipants(conversation);
    const data = this.getMessagesPerParticipant(conversation.messages, participants);
    const graphData = this.formatBarData('# of messages per participant', data[0], data[1]);
    this.displayGraph('message-count', graphData, 'horizontalBar');
  }

  displayWordCountGraph(conversation) {
    const minlen = 3;
    const N = 100;
    const data = this.getMostUsedWords(conversation.messages, minlen, N);
    const graphData = this.formatBarData('Most used words', data[0], data[1]);
    const aspectRatio = Math.min(50 / data[0].length, 2); // empirically determined
    this.displayGraph('word-count', graphData, 'horizontalBar', aspectRatio);
  }

  displayActivityGraph(conversation) {
    const participants = getParticipants(conversation);
    const dataPoints = Math.min(100, conversation.messages.length / 10);
    const data = this.getActivityPerParticipant(conversation.messages, participants, dataPoints);
    const graphData = this.formatLineData(participants, data[0], data[1]);
    const aspectRatio = 1.5;
    this.displayGraph('message-activity', graphData, 'line', aspectRatio);
  }

  /* Chart formatting */

  formatBarData(label, labels, values) {
    return  {
      labels: labels,
      datasets: [{
        label: label,
        data: values,
        backgroundColor: labels
          .map(data_label => hashColor(data_label))
          .map(hex => hex2rgba(hex, 0.2)),
        borderColor: labels
          .map(data_label => hashColor(data_label))
          .map(hex => hex2rgba(hex)),
        borderWidth: 1
      }]
    };
  }

  formatLineData(participants, labels, values) {
    return {
      labels: labels,
      datasets: participants.map(name => {
        return {
          label: name,
          borderColor: hex2rgba(hashColor(name)),
          fill: false,
          data: values[name]
        };
      })
    };
  }

  displayGraph(id, data, type, aspectRatio = 2) {
    if (this.graphs[id]) { // TODO not optimal. Should reuse graphs instead of reinstanciating every time.
      this.graphs[id].destroy();
      delete this.graphs[id];
    }
    let ctx = document.querySelector('#'+id).getContext('2d');
    this.graphs[id] = new Chart(ctx, {
      type: type,
      data: data,
      options: {
        responsive: true,
        aspectRatio: aspectRatio,
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true
            }
          }]
        }
      }
    });
  }

  /*
    Analytics methods
  */
  getMessagesPerParticipant(messages, participants) {
    let count = {};
    participants.forEach(p => count[p] = 0);

    messages.forEach(m => {
      count[m.senderName]++;
    });

    let filteredCount = {};
    for (const senderName in count) { // delete messages from non-participants
      if (participants.includes(senderName)) {
        filteredCount[senderName] = count[senderName];
      }
    }

    return this.sortDesc(filteredCount);
  }

  getMostUsedWords(messages, minlen, N) {
    let words = {};
    messages.forEach(m => {
      if (m.content) {
        m.content.split(/[^\w]/).forEach(word => {
          if (word.length > minlen) {
            if (word in words) {
              words[word]++;
            } else {
              words[word] = 1;
            }
          }
        });
      }
    });

    return this.sortDesc(words, N);
  }

  getActivityPerParticipant(messages, participants, dataPoints) {
    const period = Math.floor((messages[0].timestampMs - messages[messages.length - 1].timestampMs) / dataPoints);
    let newPeriod = messages[0].timestampMs;
    let index = 0;
    let labels = [];
    let count = {};
    let values = {};

    participants.forEach(participant => count[participant] = 0);
    participants.forEach(participant => values[participant] = []);

    function updateStep() {
      participants.forEach(participant => {
        values[participant].unshift(count[participant]);
      });
      labels.unshift(formatTimestamp(newPeriod, false));

      participants.forEach(participant => count[participant] = 0);
      newPeriod -= period;
    }

    while (index < messages.length) {
      if (messages[index].timestampMs < newPeriod - period) {
        updateStep();
        while (messages[index].timestampMs < newPeriod - period) {
          updateStep();
        }
      }
      count[messages[index].senderName]++;
      index++;
    }
    updateStep(); // update any residuals (which will be the first data point)

    return [labels, values];
  }

  sortDesc(values, N = -1) {
    let sortedLabels = [];
    let sortedValues = [];

    for (const label in values) {
      let j = 0;
      for (; j < sortedLabels.length; j++) {
        if (values[label] > sortedValues[j]) {
          sortedLabels.splice(j, 0, label);
          sortedValues.splice(j, 0, values[label]);
          if (N !== -1) {
            sortedLabels.splice(N, sortedLabels.length);
            sortedValues.splice(N, sortedValues.length);
          }
          break;
        }
      }
      if (j === sortedLabels.length && (N === -1 || sortedLabels.length < N)) {
        sortedLabels.push(label);
        sortedValues.push(values[label]);
      }
    }

    return [sortedLabels, sortedValues];
  }

  /* Show / hide methods */

  showInstructions() {
    this.instructions.style.display = 'block';
  }

  hideInstructions() {
    this.instructions.style.display = 'none';
  }

  showViewer() {
    this.viewer.style.display = 'block';
  }

  hideViewer() {
    this.viewer.style.display = 'none';
  }
}
class ConversationViewer {
  constructor(storage) {
    this.renderer = new ConversationRenderer();
    this.storage = storage;

    this.viewer = document.querySelector('#conversation-viewer');
    this.instructions = document.querySelector('#instructions');
    this.controls = document.querySelector('#conversation-controls');

    this.messages = {};
    this.current = undefined;

    this.initDateInput();
    this.initSearch();
    this.initScroll();
  }

  /* Public methods */

  async display(id, state) {
    this.clear(); // Start by clearing the current contents of the view
    this.hideInstructions();
    this.showControls();
    this.current = id;

    if (!this.messages[id]) {
      const conversation = await this.storage.getConversation(id);
      this.messages[id] = new Messages(conversation.messages);
      if (state) {
        this.messages[id].setState(state);
      }
    }

    this.renderer.render(this.messages[id]);
    this.setDefaultScroll();
  }

  displayNone() {
    this.clear();
    this.showInstructions();
    this.hideControls();
  }

  getState() {
    let state = {};
    for (const id in this.messages) {
      state[id] = this.messages[id].getState();
    }
    return state;
  }

  notifyDeleted(id) {
    delete this.messages[id];
  }

  /* Internal methods */

  displayCurrentAtIndex(index) {
    this.messages[this.current].loadAtIndex(index);
    this.display(this.current);
    this.setCenteredScroll(index);
  }

  setDefaultScroll() {
    // Set initial scrolling position
    let scrollTop = this.messages[this.current].getScrollTop();
    if (scrollTop === undefined) { // Set the cursor to the bottom of the page if unset
      this.viewer.scrollTop = this.viewer.scrollHeight;
      this.messages[this.current].setScrollTop(this.viewer.scrollHeight);
    } else {
      this.viewer.scrollTop = scrollTop;
    }
  }

  setCenteredScroll(index) {
    const scrollTop = this.renderer.getScrollTopFromIndex(index) - this.viewer.clientHeight / 4; // to set the start of the desired messages in the center-top of the screen
    this.messages[this.current].setScrollTop(scrollTop);
    this.viewer.scrollTop = scrollTop;
  }

  initDateInput() {
    $('#date-input').daterangepicker({
      singleDatePicker: true,
      showDropdowns: true,
      minYear: 2005,
      maxYear: parseInt(moment().format('YYYY'), 10)
    }, (start, end, label) => {
      const timestampMs = Date.parse(start);
      const index = this.messages[this.current].getTimestampIndex(timestampMs);
      this.displayCurrentAtIndex(index);
      this.messages[this.current].resetSearchIndex();
    });
  }

  initSearch() {
    const searchInput = document.querySelector('#search-input');
    const searchNext = document.querySelector('#search-next');
    const searchPrev = document.querySelector('#search-prev');

    searchInput.oninput = e => {
      searchInput.classList.remove('not-found');
    };
    searchInput.onkeyup = e => {
      if (e.key === 'Enter' && e.shiftKey) {
        this.searchPrev(searchInput.value);
      } else if (e.key === 'Enter') {
        this.searchNext(searchInput.value);
      }
    };
    searchNext.onclick = e => this.searchNext(searchInput.value);
    searchPrev.onclick = e => this.searchPrev(searchInput.value);
  }

  searchNext(searchString) {
    this.clearNotFound();
    searchString = RegExp.escape(searchString);
    if (!searchString) {
      return;
    }

    const currentIndex = this.renderer.getIndexFromScrollTop(this.viewer.scrollTop);
    const nextIndex = this.messages[this.current].findNextOccurence(searchString, currentIndex);

    if (nextIndex !== -1) {
      this.displayCurrentAtIndex(nextIndex);
      this.renderer.highlightText(searchString, nextIndex);
    } else {
      this.searchNotFound();
    }
  }

  searchPrev(searchString) {
    this.clearNotFound();
    searchString = RegExp.escape(searchString);
    if (!searchString) {
      return;
    }

    const currentIndex = this.renderer.getIndexFromScrollTop(this.viewer.scrollTop + this.viewer.clientHeight);
    const prevIndex = this.messages[this.current].findPrevOccurence(searchString, currentIndex);

    if (prevIndex !== -1) {
      this.displayCurrentAtIndex(prevIndex);
      this.renderer.highlightText(searchString, prevIndex);
    } else {
      this.searchNotFound();
    }
  }

  searchNotFound() {
    const searchInput = document.querySelector('#search-input');
    searchInput.classList.add('not-found');
  }

  clearNotFound() {
    const searchInput = document.querySelector('#search-input');
    searchInput.classList.remove('not-found');
  }

  initScroll() {
    this.viewer.onscroll = () => {
      if (!this.messages[this.current]) { // weird race conditions when building the conversation
        return;
      }
      this.messages[this.current].setScrollTop(this.viewer.scrollTop);
      let statusChanged = false;

      if (this.viewer.scrollTop === 0) { // if reached the top of the page
        statusChanged = this.messages[this.current].loadPreviousMessages();
      } else if (this.viewer.scrollTop + this.viewer.clientHeight === this.viewer.scrollHeight) { // if reached the bottom of the page
        statusChanged = this.messages[this.current].loadNextMessages();
      }
      if (statusChanged) {
        this.display(this.current).then(() => {
          const newScrollTop = this.messages[this.current].getScrollTop() + this.renderer.getDelta();
          this.messages[this.current].setScrollTop(newScrollTop);
          this.viewer.scrollTop = newScrollTop;
        });
      }
    };
  }

  clear() {
    this.current = undefined;
    this.renderer.clear();
  }

  showInstructions() {
    this.instructions.style.display = 'block';
  }

  hideInstructions() {
    this.instructions.style.display = 'none';
  }

  showControls() {
    this.controls.style.visibility = 'visible';
  }

  hideControls() {
    this.controls.style.visibility = 'hidden';
  }
}

class Messages {
  constructor(messages) {
    this.messages = messages;

    this.endIndex = 0;
    this.startIndex = Math.min(20, this.messages.length - 1);

    this.scrollTop = undefined;

    this.searchIndex = undefined;
    this.searchString = undefined;
  }

  getMessages() {
    return this.messages.slice(this.endIndex, this.startIndex + 1).reverse();
  }

  getTimestampIndex(timestampMs) {
    if (timestampMs >= this.messages[0].timestampMs) { // if it's more recent than the most recent message
      return this._toChronologicalIndex(0);
    }
    if (timestampMs <= this.messages[this.messages.length - 1].timestampMs) { // if it's older than the oldest message
      return this._toChronologicalIndex(this.messages.length - 1);
    }
    let index = 0;
    while (index < this.messages.length - 1) {
      if (this.messages[index].timestampMs >= timestampMs && this.messages[index + 1].timestampMs < timestampMs) { // O(n) there's probably more efficient
        break;
      }
      index++;
    }
    return this._toChronologicalIndex(index);
  }

  loadPreviousMessages() {
    const prevStartIndex = this.startIndex;
    this.startIndex = Math.min(this.startIndex + 10, this.messages.length - 1);
    if (prevStartIndex != this.startIndex) {
      if (this.startIndex - this.endIndex > 100) { // remove some of the newer messages if too long
        this.endIndex = Math.max(0, this.startIndex - 50);
      }
      return true;
    } else {
      return false;
    }
  }

  loadNextMessages() {
    const prevEndIndex = this.endIndex;
    this.endIndex = Math.max(this.endIndex - 10, 0);
    if (prevEndIndex != this.endIndex) {
      if (this.startIndex - this.endIndex > 100) { // remove some of the older messages if too long
        this.startIndex = Math.min(this.endIndex + 50, this.messages.length - 1);
      }
      return true;
    } else {
      return false;
    }
  }

  loadAtIndex(index) {
    index = this._toChronologicalIndex(index);
    this.startIndex = Math.min(index + 25, this.messages.length - 1);
    this.endIndex = Math.max(index - 25, 0);
    this.scrollTop = 0;
  }

  findNextOccurence(searchString, searchIndex) {
    searchIndex = this._toChronologicalIndex(searchIndex);
    searchIndex = this.determineSearchIndex(searchString, searchIndex) - 1; // add an offset to prevent loops.
    const regex = new RegExp(searchString, 'i');

    while (searchIndex >= 0) { // Log(n) there's probably more efficient
      if (this.messages[searchIndex].content && regex.test(this.messages[searchIndex].content)) {
        break;
      }
      searchIndex--;
    }
    if (searchIndex === -1) {
      return -1;
    }
    this.searchIndex = searchIndex;
    this.searchString = searchString;

    return this._toChronologicalIndex(searchIndex);
  }

  findPrevOccurence(searchString, searchIndex) {
    searchIndex = this._toChronologicalIndex(searchIndex);
    searchIndex = this.determineSearchIndex(searchString, searchIndex) + 1; // add an offset to prevent loops
    const regex = new RegExp(searchString, 'i');

    while (searchIndex < this.messages.length) { // Log(n) there's probably more efficient
      if (this.messages[searchIndex].content && regex.test(this.messages[searchIndex].content)) {
        break;
      }
      searchIndex++;
    }
    if (searchIndex === this.messages.length) {
      return -1;
    }
    this.searchIndex = searchIndex;
    this.searchString = searchString;

    return this._toChronologicalIndex(searchIndex);
  }

  determineSearchIndex(searchString, searchIndex) {
    if (!this.searchIndex) {
      return searchIndex;
    } else if (this.searchString === searchString) {
      return this.searchIndex;
    } else if (Math.abs(this.searchIndex - searchIndex) < 15) { // Hacky. Basically if we're close enough we stay on the current search index, even if it's from a previous search, to ensure continuity within the same screen
      return this.searchIndex;
    } else {
      return searchIndex;
    }
  }

  resetSearchIndex() {
    this.searchIndex = undefined;
  }

  /* State methods */

  getState() {
    return this.serializeState(this.startIndex, this.endIndex, this.scrollTop);
  }

  setState(serializedState) {
    const state = this.parseState(serializedState);
    this.startIndex = parseInt(state[0], 10);
    this.endIndex = parseInt(state[1], 10);
    this.scrollTop = parseInt(state[2], 10);
  }

  parseState(state) {
    return state.split(':');
  }

  serializeState(startIndex, endIndex, scrollTop) {
    return startIndex + ':' + endIndex + ':' + scrollTop;
  }

  /* Getters and setters */

  setScrollTop(scrollTop) {
    this.scrollTop = scrollTop;
  }

  getScrollTop() {
    return this.scrollTop;
  }

  getStartIndex() {
    return this._toChronologicalIndex(this.startIndex);
  }

  _toChronologicalIndex(index) { // reverts the index (i.e as if the messages were chronologically indexed) (or vice versa);
    return (this.messages.length - 1) - index;
  }
}

class ConversationRenderer {
  constructor() {
    this.profilePictures = new ProfilePictures();
    this.viewer = document.querySelector('#conversation-viewer');
    this.delta = 0;
    this.articleSizes = [];
  }

  render(messages) {
    const articles = this.createArticles(messages.getMessages(), messages.getStartIndex());
    for (const article of articles) {
      this.viewer.appendChild(article);
    }
    this._updateDelta();
  }

  getDelta() {
    return this.delta;
  }

  getScrollTopFromIndex(index) {
    let sum = 0;
    let i = 0;
    while (i < this.articleSizes.length - 1 && this.articleSizes[i+1][0] <= index) {
      sum += this.articleSizes[i++][1];
    }
    return sum;
  }

  getIndexFromScrollTop(scrollTop) {
    let sum = 0;
    let i = 1;
    while (i < this.articleSizes.length && scrollTop > sum) {
      sum += this.articleSizes[i++][1];
    }
    return this.articleSizes[i-1][0];
  }

  /* Divides a conversation into an array of arrays of consecutive messages sent by the same sender within an hour. */
  createArticles(messages, startId) {
    function sameSender(messageA, messageB) {
      return messageA['senderName'] === messageB['senderName'];
    }
    function withinAnHour(messageA, messageB) {
      return Math.abs(messageB.timestampMs - messageA.timestampMs) < 3600 * 1000;
    }

    let articles = [];
    let i = 0;

    while (i < messages.length) {
      let consecutiveMessages = [messages[i]];
      let j = 1;
      while (messages[i+j] && sameSender(messages[i], messages[i+j]) && withinAnHour(messages[i], messages[i+j])) {
        consecutiveMessages.push(messages[i + j++]);
      }
      articles.push(this.createArticleNode(consecutiveMessages, startId + i));
      i += j;
    }

    return articles;
  }

  /* Create an article node from an array of consecutive JSON messages. */
  createArticleNode(consecutiveMessages, id) {
    /*
      Generate a content paragraph.
    */
    function createParagraphNode(textContent, classes) {
      let content = document.createElement('p');
      content.setAttribute('class', classes);
      content.textContent = textContent;

      return content;
    }

    const article = document.createElement('article');
    article.setAttribute('class', 'message');
    article.setAttribute('id', 'id_' + id);
    const timestamp = createParagraphNode(formatTimestamp(consecutiveMessages[0].timestampMs), 'timestamp');
    article.appendChild(timestamp);
    const participant = createParagraphNode(consecutiveMessages[0]['senderName'], 'sender-name');
    article.appendChild(participant);
    const profilePicture = this.profilePictures.getPicture(consecutiveMessages[0]['senderName']);

    if (consecutiveMessages.length === 1) {
      const content = createParagraphNode(consecutiveMessages[0]['content'], 'content');
      article.appendChild(profilePicture);
      article.appendChild(content);
    } else {
      const topContent = createParagraphNode(consecutiveMessages[0]['content'], 'content top');
      article.appendChild(topContent);

      for (let i = 1; i < consecutiveMessages.length - 1; i++) {
        const middleContent = createParagraphNode(consecutiveMessages[i]['content'], 'content middle');
        article.appendChild(middleContent);
      }

      const bottomContent = createParagraphNode(consecutiveMessages[consecutiveMessages.length - 1]['content'], 'content bottom');
      article.appendChild(profilePicture);
      article.appendChild(bottomContent);
    }

    return article;
  }

  highlightText(text, index) {
    function createHighlightedText(text) {
      const span = document.createElement('span');
      span.setAttribute('class', 'highlighted');
      span.textContent = text;
      return span;
    }

    let i = 0;
    while (i < this.articleSizes.length - 1 && this.articleSizes[i+1][0] <= index) {
      i++;
    }

    const offset = index - this.articleSizes[i][0];
    const article = document.querySelector('#id_' + this.articleSizes[i][0]);
    const message = article.querySelectorAll('.content')[offset];

    const regexp = new RegExp(text, 'gi');
    const fragments = message.textContent.split(regexp).map(t => document.createTextNode(t));
    const matches = message.textContent.matchAll(regexp);

    message.textContent = '';
    for (let i = 0; i < fragments.length - 1; i++) {
      const nextMatch = matches.next().value;
      message.appendChild(fragments[i]);
      message.appendChild(createHighlightedText(nextMatch));
    }

    message.appendChild(fragments[fragments.length - 1]);
  }

  clear() {
    while (this.viewer.firstChild) {
      this.viewer.removeChild(this.viewer.firstChild);
    }
  }

  /*
    Internal methods to keep track of the individual article sizes as well as the difference in render sizes of the oldest non-overlapping articles between two successive renders.
  */

  _updateDelta() {
    const newArticleSizes = this._getArticleSizes();
    this.delta = this._resolveDelta(newArticleSizes, this.articleSizes);
    this.articleSizes = newArticleSizes;
  }

  _resolveDelta(newArticleSizes, articleSizes) {
    if (!articleSizes.length) {
      articleSizes = [[Infinity, 0]];
    }

    if (newArticleSizes[0][0] > articleSizes[0][0]) { // always force the (chronologically) older articles to be from the newly rendered articles
      return - this._resolveDelta(articleSizes, newArticleSizes);
    }

    let i = 0;
    let sum = 0;
    while (i < newArticleSizes.length - 1 && newArticleSizes[i+1][0] <= articleSizes[0][0]) {
      sum += newArticleSizes[i++][1];
    }
    if (newArticleSizes[i][0] !== articleSizes[0][0]) { // to account for "overlapping" articles
      sum += newArticleSizes[i][1] - articleSizes[0][1];
    }

    return sum;
  }

  _getArticleSizes() {
    let sizes = [];
    for (const article of this.viewer.children) {
      const id = parseInt(article.getAttribute('id').split('_')[1]);
      sizes.push([id, article.offsetHeight]);
    }
    return sizes;
  }
}
const storage = new ConversationIDBStorage();
const viewer = new ConversationViewer(storage);
const controller = new Controller(storage, viewer);
storage.initialize().then(() => controller.initialize());
