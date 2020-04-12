# Facebook Messages Browser

![Facebook messages browser UI][screenshot]

## Description

The Facebook messages browser makes it easier to browse your Facebook threads, in particular by allowing you to upload and view multiple threads at a time, go to any date using the date picker, and by saving your location in the thread when you leave the page, so that you can resume reading the thread from the same location the next time you open the page. Finally, you will find some fun graphs about your threads in the analytics tab!

This is a pure JavaScript application: basically, it is a "pretty" interface for the archived threads, which I try to make visually close to the real Facebook messenger interface. 

## Installation

* Clone this repository, or download the [.zip of the release][download] and unzip its contents. 
* To download your archived Facebook threads:
    * Go to your Facebook account settings page
    * Select the "Your personal information" tab from the left panel
    * Click on "Download your information"
    * Deselect all checkboxes except for "Messages". **In the "Format" dropdown menu, select "JSON"**. Optionally, provide a date range.
    * Click on "Create a file"
    * Once it has been created, download the archive
* Unpack the archive such that the messages/ folder is in the same directory as the \*.html files.


## Usage

* Open the file index.html in your web browser.
* Locate the JSON of the threads you want to upload in messages/inbox/
* Upload them using the button in the left sidebar. **Note: if there are multiple files for the same thread (e.g.: message_1.json, message_2.json, etc.), select all of them at the same time to merge them.**

## Contribute

Feel free to report bugs using the GitHub issue tracker and make other contributions.

## License

This project is licensed under GPL-3.0

[screenshot]: FbMessagesBrowser-screen.png "Facebook messages browser UI"
[download]: https://github.com/spqrxt/fbmessagesbrowser/raw/master/fbmessagesbrowser.zip "fbmessagesbrowser.zip"
