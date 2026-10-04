
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#ifdef _WIN32
  #include <winsock2.h>
  typedef int socklen_t;
#else
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <sys/time.h>
  #include <unistd.h>
  typedef int SOCKET;
  #define INVALID_SOCKET (-1)
  #define closesocket close
#endif

#define PORT 8080
#define MAX_REQUEST (2 * 1024 * 1024)   /* biggest request we accept: 2 MB */

/* Send one HTTP reply (status line + headers + body) to the browser */
static void send_response(SOCKET c, const char *status, const char *type,
                          const char *body, long len) {
    char head[256];
    int n = snprintf(head, sizeof head,
        "HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %ld\r\nConnection: close\r\n\r\n",
        status, type, len);
    send(c, head, n, 0);
    long sent = 0;
    while (sent < len) {
        int r = send(c, body + sent, (int)(len - sent), 0);
        if (r <= 0) break;
        sent += r;
    }
}

/* Read a whole file into memory. Returns NULL if the file does not exist. */
static char *read_file(const char *name, long *len) {
    FILE *f = fopen(name, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    *len = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *data = malloc(*len + 1);
    if (data) { fread(data, 1, *len, f); data[*len] = 0; }
    fclose(f);
    return data;
}

/* Which Content-Type to use for a file name? NULL = we do not serve this kind of file */
static const char *content_type(const char *name) {
    const char *dot = strrchr(name, '.');
    if (!dot) return NULL;
    if (!strcmp(dot, ".html")) return "text/html; charset=utf-8";
    if (!strcmp(dot, ".css"))  return "text/css; charset=utf-8";
    if (!strcmp(dot, ".js"))   return "text/javascript; charset=utf-8";
    if (!strcmp(dot, ".png"))  return "image/png";
    if (!strcmp(dot, ".jpg"))  return "image/jpeg";
    if (!strcmp(dot, ".ico"))  return "image/x-icon";
    return NULL;   /* .json, .c, .exe ... are never sent to the browser */
}

/* Find a header such as "Content-Length:" (ignores upper/lower case). Returns text after it. */
static char *find_header(char *text, const char *name) {
    size_t n = strlen(name);
    for (char *p = text; *p; p++) {
        size_t i = 0;
        while (i < n && p[i] && tolower((unsigned char)p[i]) == tolower((unsigned char)name[i])) i++;
        if (i == n) return p + n;
    }
    return NULL;
}

static void handle_client(SOCKET c) {
    char *buf = malloc(MAX_REQUEST + 1);
    if (!buf) return;
    int total = 0, content_len = 0;
    char *body = NULL;

    /* 1. Receive the request until we have the headers and the full body */
    while (total < MAX_REQUEST) {
        int r = recv(c, buf + total, MAX_REQUEST - total, 0);
        if (r <= 0) break;
        total += r;
        buf[total] = 0;
        if (!body) {
            char *end = strstr(buf, "\r\n\r\n");     /* blank line = end of headers */
            if (!end) continue;
            *end = 0;
            body = end + 4;
            char *cl = find_header(buf, "Content-Length:");
            if (cl) content_len = atoi(cl);
        }
        if (total - (int)(body - buf) >= content_len) break;
    }
    if (!body) { free(buf); return; }

    /* 2. Read the first line, e.g.  GET /index.html HTTP/1.1 */
    char method[8] = "", path[512] = "";
    sscanf(buf, "%7s %511s", method, path);
    char *q = strchr(path, '?');
    if (q) *q = 0;

    /* 3. Decide what to answer */
    if (strcmp(path, "/api/data") == 0) {
        if (strcmp(method, "GET") == 0) {                 /* load data */
            long len;
            char *data = read_file("data.json", &len);
            if (data && len > 0) send_response(c, "200 OK", "application/json", data, len);
            else                 send_response(c, "200 OK", "application/json", "null", 4);
            free(data);
        } else if (strcmp(method, "POST") == 0) {         /* save data */
            if (total - (int)(body - buf) < content_len) {
                send_response(c, "400 Bad Request", "text/plain", "Too big", 7);
            } else {
                FILE *f = fopen("data.json", "wb");
                if (f) { fwrite(body, 1, content_len, f); fclose(f); }
                send_response(c, "200 OK", "application/json", "{\"ok\":true}", 11);
            }
        } else {
            send_response(c, "405 Method Not Allowed", "text/plain", "No", 2);
        }
    } else if (strcmp(method, "GET") == 0) {              /* website files */
        const char *name = path + 1;                      /* skip the first "/" */
        if (*name == 0) name = "index.html";
        const char *type = content_type(name);
        /* only plain file names in this folder: no "..", no sub-folders */
        if (strstr(name, "..") || strchr(name, '/') || strchr(name, '\\') || !type) {
            send_response(c, "404 Not Found", "text/plain", "Not found", 9);
        } else {
            long len;
            char *data = read_file(name, &len);
            if (data) send_response(c, "200 OK", type, data, len);
            else      send_response(c, "404 Not Found", "text/plain", "Not found", 9);
            free(data);
        }
    } else {
        send_response(c, "405 Method Not Allowed", "text/plain", "No", 2);
    }
    free(buf);
}

int main(void) {
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);       /* Windows needs this before using sockets */
#endif
    SOCKET server = socket(AF_INET, SOCK_STREAM, 0);
    if (server == INVALID_SOCKET) { printf("Could not create socket\n"); return 1; }

    int yes = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, (const char *)&yes, sizeof yes);

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof addr);
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(PORT);

    if (bind(server, (struct sockaddr *)&addr, sizeof addr) < 0) {
        printf("Port %d is already in use. Close the other server and try again.\n", PORT);
        return 1;
    }
    listen(server, 10);
    printf("Library server running at http://127.0.0.1:%d\n", PORT);
    printf("Press Ctrl+C to stop.\n");

    for (;;) {                                            /* wait for the browser, again and again */
        SOCKET client = accept(server, NULL, NULL);
        if (client == INVALID_SOCKET) continue;
#ifdef _WIN32
        DWORD ms = 2000;                                  /* don't wait forever on idle connections */
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (const char *)&ms, sizeof ms);
#else
        struct timeval tv = {2, 0};
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);
#endif
        handle_client(client);
        closesocket(client);
    }
    return 0;
}
