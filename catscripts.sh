for file in scripts/pages/* ; do
    cat scripts/utilities/utilities.js scripts/storage/idbstorage.js scripts/controller/controller.js scripts/viewer/* $file > scripts/$(basename $file)
    echo "catted scripts to scripts/$(basename $file)"
done
