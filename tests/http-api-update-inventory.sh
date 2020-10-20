#!/bin/bash

host='192.168.11.10'
xmlurl='http://img.nothingshop.com/tmp/xml_inventory_short.xml'

curl --request GET -sL \
     --url "http://$host/api/update-db-inventory?xmlurl=$xmlurl"
