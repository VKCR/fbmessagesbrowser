for file in pages/* ; do
    cat utilities/utilities.js storage/idbstorage.js controller/controller.js viewer/* $file > $(basename $file)
done
