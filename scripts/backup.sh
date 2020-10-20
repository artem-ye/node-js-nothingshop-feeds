#!/bin/bash

#SRC_DIR=`realpath ../`
#BACKUP_DIR=`realpath ../.backup`
SRC_DIR='/var/www/static_feeds_backend'
BACKUP_DIR='/var/www/static_feeds_backend/.backup'

main() {
	echo "Backup stated..."
	echo "Src dir: $SRC_DIR Backup dir $BACKUP_DIR"
	
	if [ ! -d "$SRC_DIR" ]; then
		echo "Src dir $SRC_DIR not exists"
		return 1
	fi

	if [ ! -d "$BACKUP_DIR" ]; then
		echo "Backup dir $BACKUP_DIR not exists"
		return 1
	fi

	arch_path="`basename "$SRC_DIR"`_`date "+%Y-%m-%d_%H-%M-%S"`.tar.gz" # File name
	arch_path="$BACKUP_DIR/$arch_path"	# Full path

	#tar -C "`dirname $SRC_DIR`" -czf "$arch_path" --exclude node_modules --exclude "$BACKUP_DIR" "`basename $SRC_DIR`"
	tar -C "`dirname $SRC_DIR`" -czf "$arch_path" --exclude node_modules --exclude `basename $BACKUP_DIR` "`basename $SRC_DIR`"
}

main
