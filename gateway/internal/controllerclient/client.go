// Package controllerclient depends only on the public Controller protocol.
package controllerclient

import (
	"fmt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	pb "sdn-controller/api/controller/v1"
)

func Dial(endpoint, ca string, allowInsecure bool) (*grpc.ClientConn, pb.NorthClient, error) {
	var transport credentials.TransportCredentials
	if ca != "" {
		c, e := credentials.NewClientTLSFromFile(ca, "")
		if e != nil {
			return nil, nil, e
		}
		transport = c
	} else if allowInsecure {
		transport = insecure.NewCredentials()
	} else {
		return nil, nil, fmt.Errorf("controller CA required; -insecure is for isolated labs")
	}
	conn, e := grpc.NewClient(endpoint, grpc.WithTransportCredentials(transport), grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(8<<20)))
	if e != nil {
		return nil, nil, e
	}
	return conn, pb.NewNorthClient(conn), nil
}
