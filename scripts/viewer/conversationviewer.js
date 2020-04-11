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
  }

  /* Public methods */

  async display(id, state) {
    this.clear(); // Start by clearing the current contents of the view
    this.clearScroll();
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

    await this.renderer.render(this.messages[id]);
    this.initScroll(id);
    this.setDefaultScroll();
  }

  displayNone() {
    this.clear();
    this.clearScroll();
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

  async displayCurrentAtIndex(index) {
    this.messages[this.current].loadAtIndex(index);
    await this.display(this.current);
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
    }, async (start, end, label) => {
      const timestampMs = Date.parse(start);
      const index = this.messages[this.current].getTimestampIndex(timestampMs);
      await this.displayCurrentAtIndex(index);
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

  async searchNext(searchString) {
    this.clearNotFound();
    searchString = RegExp.escape(searchString);
    if (!searchString) {
      return;
    }

    const currentIndex = this.renderer.getIndexFromScrollTop(this.viewer.scrollTop);
    const nextIndex = this.messages[this.current].findNextOccurence(searchString, currentIndex);

    if (nextIndex !== -1) {
      await this.displayCurrentAtIndex(nextIndex);
      this.renderer.highlightText(searchString, nextIndex);
    } else {
      this.searchNotFound();
    }
  }

  async searchPrev(searchString) {
    this.clearNotFound();
    searchString = RegExp.escape(searchString);
    if (!searchString) {
      return;
    }

    const currentIndex = this.renderer.getIndexFromScrollTop(this.viewer.scrollTop + this.viewer.clientHeight);
    const prevIndex = this.messages[this.current].findPrevOccurence(searchString, currentIndex);

    if (prevIndex !== -1) {
      await this.displayCurrentAtIndex(prevIndex);
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

  initScroll(id) {
    this.viewer.onscroll = () => {
      this.messages[id].setScrollTop(this.viewer.scrollTop);
      let statusChanged = false;

      if (this.viewer.scrollTop === 0) { // if reached the top of the page
        statusChanged = this.messages[id].loadPreviousMessages();
      } else if (this.viewer.scrollTop + this.viewer.clientHeight === this.viewer.scrollHeight) { // if reached the bottom of the page
        statusChanged = this.messages[id].loadNextMessages();
      }
      if (statusChanged) {
        this.display(id).then(() => {
          const newScrollTop = this.messages[id].getScrollTop() + this.renderer.getDelta();
          this.messages[id].setScrollTop(newScrollTop);
          this.viewer.scrollTop = newScrollTop;
        });
      }
    };
  }

  clearScroll() {
    this.viewer.onscroll = undefined;
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

  getMessagesFromIndices(startIndex, endIndex) {
    startIndex = Math.min(this._toChronologicalIndex(startIndex), this.messages.length - 1);
    endIndex = Math.max(this._toChronologicalIndex(endIndex), 0);
    return this.messages.slice(endIndex, startIndex + 1).reverse();
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

  getEndIndex() {
    return this._toChronologicalIndex(this.endIndex);
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
    this.nodeCache = {};
  }

  async render(messages) {
    const articles = await this.createArticles(messages.getMessages(), messages.getStartIndex());
    for (const article of articles) {
      this.viewer.appendChild(article);
    }
    this._updateDelta();
    this._prepopulateNodeCache(messages);
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
  async createArticles(messages, startId) {
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
      const articleNode = await this.createArticleNode(consecutiveMessages, startId + i);
      articles.push(articleNode);
      i += j;
    }

    return articles;
  }

  /* Create an article node from an array of consecutive JSON messages. */
  async createArticleNode(consecutiveMessages, id) {
    const article = document.createElement('article');
    article.setAttribute('class', 'message');
    article.setAttribute('id', 'id_' + id);
    const timestamp = await this.createParagraphNode(formatTimestamp(consecutiveMessages[0].timestampMs), 'timestamp');
    article.appendChild(timestamp);
    const participant = await this.createParagraphNode(consecutiveMessages[0]['senderName'], 'sender-name');
    article.appendChild(participant);
    const profilePicture = this.profilePictures.getPicture(consecutiveMessages[0]['senderName']);

    if (consecutiveMessages.length === 1) {
      const content = await this.createNode(id, consecutiveMessages[0], 'content');
      article.appendChild(profilePicture);
      article.appendChild(content);
      if (content.classList.contains('has-reaction')) {
        profilePicture.classList.add('has-reaction');
      }
    } else {
      const topContent = await this.createNode(id, consecutiveMessages[0], 'content top');
      article.appendChild(topContent);

      for (let i = 1; i < consecutiveMessages.length - 1; i++) {
        const middleContent = await this.createNode(id + i, consecutiveMessages[i], 'content middle');
        article.appendChild(middleContent);
      }

      const bottomContent = await this.createNode(id + consecutiveMessages.length - 1, consecutiveMessages[consecutiveMessages.length - 1], 'content bottom');
      article.appendChild(profilePicture);
      article.appendChild(bottomContent);
      if (bottomContent.classList.contains('has-reaction')) {
        profilePicture.classList.add('has-reaction');
      }
    }

    return article;
  }

  async createParagraphNode(textContent, classes) {
    let content = document.createElement('p');
    content.setAttribute('class', classes);
    content.textContent = textContent;

    return content;
  }

  async createImageNode(index, images, classes) {
    let content = document.createElement('p');
    content.setAttribute('class', classes);
    for (const image of images) {
      const identifier = index + ':' + image['uri'];
      if (identifier in this.nodeCache) {
        content.append(this.nodeCache[identifier]);
      } else {
        let img = document.createElement('img');
        img.setAttribute('src', image['uri']);
        await new Promise(resolve => { img.onload = () => resolve(); });
        content.appendChild(img);
        this.nodeCache[identifier] = img;
      }
    }

    return content;
  }

  async createVideoNode(index, videos, classes) {
    let content = document.createElement('p');
    content.setAttribute('class', classes);
    for (const video of videos) {
      const identifier = index + ':' + video['uri'];
      if (identifier in this.nodeCache) {
        content.append(this.nodeCache[identifier]);
      } else {
        let vid = document.createElement('video');
        vid.setAttribute('src', video['uri']);
        vid.setAttribute('poster', video['thumbnail']['uri']);
        vid.setAttribute('controls', true);
        await new Promise(resolve => { vid.onloadeddata = () => resolve(); });
        content.appendChild(vid);
        this.nodeCache[identifier] = vid;
      }
    }

    return content;
  }

  async createShareNode(text, share, classes) {
    let content = document.createElement('p');
    content.setAttribute('class', classes);
    let link = document.createElement('a');
    link.setAttribute('href', share['link']);
    link.setAttribute('target', '_blank');
    link.textContent = text;
    content.appendChild(link);

    return content;
  }

  async createNode(id, message, classes) {
    let node;
    if (message.photos) {
      node = await this.createImageNode(id, message.photos, classes);
    } else if (message.gifs) {
      node = await this.createImageNode(id, message.gifs, classes);
    } else if (message.sticker) {
      node = await this.createImageNode(id, [message.sticker], classes);
    } else if (message.videos) {
      node = await this.createVideoNode(id, message.videos, classes);
    } else if (message.share) {
      node = await this.createShareNode(message.content, message.share, classes);
    } else{
      node = await this.createParagraphNode(message.content, classes);
    }

    if (message.reactions) {
      const reactions = this.createReactions(message.reactions);
      node.appendChild(reactions);
      node.classList.add('has-reaction');
    }

    return node;
  }

  createReactions(reactions) {
    const p = document.createElement('p');
    p.setAttribute('class', 'reaction');
    let uniqueReactions = [];
    let actors = [];

    reactions.forEach(r => {
      if (!uniqueReactions.includes(r.reaction)) {
        uniqueReactions.push(r.reaction);
      }
      actors.push(r.actor);
    });

    p.textContent = uniqueReactions.join(' ') + ' ' + reactions.length;
    p.setAttribute('title', actors.join(', '));

    return p;
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

    let reaction = undefined;
    if (message.classList.contains('has-reaction')) {
      reaction = message.querySelector('.reaction');
      message.removeChild(reaction);
    }

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

    if (reaction) {
      message.appendChild(reaction);
    }
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

  _prepopulateNodeCache(messages) {
    this.nodeCache = {}; // empty cache
    let startIndex = Math.max(messages.getStartIndex() - 100, 0);
    let endIndex = messages.getEndIndex() + 100;
    const m = messages.getMessagesFromIndices(startIndex, endIndex);

    for (let i = 0; i < m.length; i++) {
      if (m[i].photos) {
        for (const photo of m[i].photos) {
          const identifier = parseInt(startIndex + i, 10) + ':' + photo['uri'];
          let img = document.createElement('img');
          img.setAttribute('src', photo['uri']);
          this.nodeCache[identifier] = img;
        }
      } else if (m[i].gifs) {
        for (const gif of m[i].gifs) {
          const identifier = parseInt(startIndex + i, 10) + ':' + gif['uri'];
          let img = document.createElement('img');
          img.setAttribute('src', gif['uri']);
          this.nodeCache[identifier] = img;
        }
      } else if (m[i].sticker) {
        const identifier = parseInt(startIndex + i, 10) + ':' + m[i].sticker['uri'];
        let img = document.createElement('img');
        img.setAttribute('src', m[i].sticker['uri']);
        this.nodeCache[identifier] = img;
      } else if (m[i].videos) {
        for (const video of m[i].videos) {
          const identifier = parseInt(startIndex + i, 10) + ':' + video['uri'];
          let vid = document.createElement('video');
          vid.setAttribute('src', video['uri']);
          vid.setAttribute('poster', video['thumbnail']['uri']);
          vid.setAttribute('controls', true);
          this.nodeCache[identifier] = vid;
        }
      }
    }
  }
}
