#!/usr/bin/env python
import os, re

#rebuild tags
os.system("ctags-exuberant -Re")

pageDir = 'pages/'
fragmentDir = 'fragments/'
for pageName in os.listdir('pages/'):
    print "Processing " + pageName + " ..."
    page = open(pageDir + pageName, "r")
    pageSrc = page.read()
    tokens = re.findall("{{.*}}", pageSrc)
    for token in tokens:
        fragment = open(fragmentDir + token[2:-2] + ".html", "r")
        fragmentSrc = fragment.read()
        pageSrc = pageSrc.replace(token, fragmentSrc[:-1]) # Remove last char, which is a \n
    newPage = open(pageName, "w")
    newPage.write(pageSrc)

os.system('./catscripts.sh')
os.system('./bundle-release.sh')
