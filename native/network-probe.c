/* SPDX-License-Identifier: GPL-3.0-or-later
 * Test fixture only: a bounded TCP connect to a numeric IPv4/IPv6 address. */
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdio.h>
int main(int argc,char **argv) {
    if(argc!=2)return 64;
    WSADATA data;if(WSAStartup(MAKEWORD(2,2),&data))return 65;
    struct addrinfo hints={0},*address=NULL;
    hints.ai_family=AF_UNSPEC;hints.ai_socktype=SOCK_STREAM;hints.ai_flags=AI_NUMERICHOST;
    if(getaddrinfo(argv[1],"443",&hints,&address))return 66;
    SOCKET s=socket(address->ai_family,SOCK_STREAM,IPPROTO_TCP);u_long nonblocking=1;
    ioctlsocket(s,FIONBIO,&nonblocking);
    int result=connect(s,address->ai_addr,(int)address->ai_addrlen),error=WSAGetLastError();
    freeaddrinfo(address);
    if(result && error==WSAEWOULDBLOCK) {
        fd_set write,except;FD_ZERO(&write);FD_ZERO(&except);FD_SET(s,&write);FD_SET(s,&except);
        struct timeval timeout={3,0};
        result=select(0,NULL,&write,&except,&timeout);
        int size=sizeof(error);getsockopt(s,SOL_SOCKET,SO_ERROR,(char*)&error,&size);
        result=(result>0 && FD_ISSET(s,&write) && !error)?0:-1;
    }
    closesocket(s);WSACleanup();
    puts(result?"BLOCKED":"CONNECTED");return result?1:0;
}
