/* SPDX-License-Identifier: GPL-3.0-or-later
 * CI fixture only: TCP, fresh Windows shared DNS, raw UDP DNS and HTTPS. */
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windns.h>
#include <winhttp.h>
#include <stdio.h>
#include <string.h>
static int tcp(const char *host) {
    struct addrinfo hints={0},*address=NULL;
    hints.ai_family=AF_UNSPEC;hints.ai_socktype=SOCK_STREAM;hints.ai_flags=AI_NUMERICHOST;
    if(getaddrinfo(host,"443",&hints,&address))return 66;
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
    closesocket(s);
    puts(result?"BLOCKED":"CONNECTED");return result?1:0;
}
static int sharedDns(const char *name) {
    PDNS_RECORDA records=NULL;
    DNS_STATUS status=DnsQuery_A(name,DNS_TYPE_A,DNS_QUERY_BYPASS_CACHE|DNS_QUERY_NO_HOSTS_FILE|DNS_QUERY_NO_MULTICAST|DNS_QUERY_TREAT_AS_FQDN,NULL,&records,NULL);
    if(status)return 67;
    int result=68;
    for(PDNS_RECORDA record=records;record;record=record->pNext)if(record->wType==DNS_TYPE_A) {
        char ip[INET_ADDRSTRLEN];IN_ADDR address;address.s_addr=record->Data.A.IpAddress;
        if(inet_ntop(AF_INET,&address,ip,sizeof(ip)))result=tcp(ip);
        break;
    }
    DnsRecordListFree(records,DnsFreeRecordList);return result;
}
static int rawDns(const char *server) {
    unsigned char packet[128]={0},response[4096];
    unsigned short id=(unsigned short)GetTickCount();packet[0]=(unsigned char)(id>>8);packet[1]=(unsigned char)id;
    packet[2]=1;packet[5]=1;int size=12;
    for(int i=0;i<4;i++){packet[size++]=3;memcpy(packet+size,"one",3);size+=3;}
    packet[size++]=0;packet[size++]=0;packet[size++]=1;packet[size++]=0;packet[size++]=1;
    SOCKADDR_IN destination={0};destination.sin_family=AF_INET;destination.sin_port=htons(53);
    if(inet_pton(AF_INET,server,&destination.sin_addr)!=1)return 69;
    SOCKET socket=WSASocketW(AF_INET,SOCK_DGRAM,IPPROTO_UDP,NULL,0,0);DWORD timeout=3000;
    setsockopt(socket,SOL_SOCKET,SO_RCVTIMEO,(const char*)&timeout,sizeof(timeout));
    int sent=sendto(socket,(const char*)packet,size,0,(SOCKADDR*)&destination,sizeof(destination));
    int received=sent==size?recv(socket,(char*)response,sizeof(response),0):0;closesocket(socket);
    return received>=12&&response[0]==packet[0]&&response[1]==packet[1]&&(response[2]&128)&&!(response[3]&15)&&(response[6]||response[7])?0:70;
}
static int https(void) {
    HINTERNET session=WinHttpOpen(L"Azadi routing test",WINHTTP_ACCESS_TYPE_NO_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
    if(!session)return 71;
    WinHttpSetTimeouts(session,3000,3000,3000,5000);
    HINTERNET connection=WinHttpConnect(session,L"one.one.one.one",443,0);
    HINTERNET request=connection?WinHttpOpenRequest(connection,L"HEAD",L"/",NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE):NULL;
    DWORD redirect=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    if(request)WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&redirect,sizeof(redirect));
    DWORD status=0,size=sizeof(status);int result=72;
    if(request && WinHttpSendRequest(request,WINHTTP_NO_ADDITIONAL_HEADERS,0,WINHTTP_NO_REQUEST_DATA,0,0,0) && WinHttpReceiveResponse(request,NULL) &&
       WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&status,&size,WINHTTP_NO_HEADER_INDEX) && status>=200 && status<400)result=0;
    if(request)WinHttpCloseHandle(request);
    if(connection)WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);puts(result?"HTTPS_FAILED":"HTTPS_VERIFIED");return result;
}
int main(int argc,char **argv) {
    if(argc!=2&&argc!=3)return 64;
    WSADATA data;if(WSAStartup(MAKEWORD(2,2),&data))return 65;
    int result;
    if(argc==2 && !strcmp(argv[1],"--https"))result=https();
    else if(argc==2)result=tcp(argv[1]);
    else if(!strcmp(argv[1],"--name"))result=sharedDns(argv[2]);
    else if(!strcmp(argv[1],"--dns"))result=rawDns(argv[2]);
    else result=64;
    WSACleanup();return result;
}
