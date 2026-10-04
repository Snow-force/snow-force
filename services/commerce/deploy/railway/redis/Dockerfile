FROM redis:7.4-alpine
COPY redis.conf /usr/local/etc/redis/redis.conf
COPY start.sh /usr/local/bin/snowforce-redis-start
RUN chmod 755 /usr/local/bin/snowforce-redis-start
WORKDIR /data
EXPOSE 6379
ENTRYPOINT ["/usr/local/bin/snowforce-redis-start"]
