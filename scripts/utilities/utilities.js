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
        type: message['type'],
        share: message['share'],
        reactions: message['reactions'],
        gifs: message['gifs'],
        videos: message['videos'],
        photos: message['photos'],
        audioFiles: message['audio_files'],
        sticker: message['sticker'],
        files: message['files']
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
