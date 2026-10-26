package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sdn-web-gateway/internal/controllerclient"
	"sdn-web-gateway/internal/httpapi"
	"strings"
	"syscall"
	"time"
)

func main() {
	addr := flag.String("listen", "127.0.0.1:18080", "HTTP listen address")
	endpoint := flag.String("controller", "127.0.0.1:19090", "Controller gRPC endpoint")
	ca := flag.String("controller-ca", "", "Controller CA PEM")
	cert := flag.String("tls-cert", "", "HTTPS certificate")
	key := flag.String("tls-key", "", "HTTPS private key")
	insecure := flag.Bool("insecure", false, "allow plaintext HTTP/gRPC in isolated labs")
	static := flag.String("static-dir", "", "optional separately-built UI directory")
	origins := flag.String("allowed-origins", "", "comma separated cross-origin UI origins")
	maxRequests := flag.Int("max-requests", 64, "maximum concurrent unary requests")
	maxStreams := flag.Int("max-streams", 64, "maximum concurrent SSE subscriptions")
	timeout := flag.Duration("rpc-timeout", 30*time.Second, "unary Controller call timeout")
	flag.Parse()
	if !*insecure && (*cert == "" || *key == "") {
		log.Fatal("HTTPS cert/key required; use -insecure explicitly for a lab")
	}
	conn, client, e := controllerclient.Dial(*endpoint, *ca, *insecure)
	if e != nil {
		log.Fatal(e)
	}
	defer conn.Close()
	handler, e := httpapi.New(client, httpapi.Config{AdminToken: os.Getenv("SDN_ADMIN_TOKEN"), ViewerToken: os.Getenv("SDN_VIEWER_TOKEN"), StaticDir: *static, AllowedOrigins: strings.Split(*origins, ","), MaxRequests: *maxRequests, MaxStreams: *maxStreams, RPCTimeout: *timeout})
	if e != nil {
		log.Fatal(e)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	server := &http.Server{Addr: *addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10, BaseContext: func(net.Listener) context.Context { return ctx }}
	go func() {
		<-ctx.Done()
		stop, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		_ = server.Shutdown(stop)
	}()
	log.Printf("sdn-web-gateway listen=%s controller=%s", *addr, *endpoint)
	if *cert != "" && *key != "" {
		e = server.ListenAndServeTLS(*cert, *key)
	} else {
		e = server.ListenAndServe()
	}
	if e != nil && e != http.ErrServerClosed {
		log.Fatal(e)
	}
}
