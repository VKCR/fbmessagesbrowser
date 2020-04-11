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
