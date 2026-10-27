module sdn-web-gateway

go 1.25.0

require (
	google.golang.org/grpc v1.79.3
	google.golang.org/protobuf v1.36.11
	sdn-agent v0.0.0
	sdn-controller v0.0.0
)

require (
	golang.org/x/net v0.48.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/text v0.32.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20251202230838-ff82c1b0f217 // indirect
)

replace sdn-controller => ../../sdn-controller

replace sdn-agent => ../../sdn-agent
