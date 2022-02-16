package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"strings"

	gen "github.com/RyoJerryYu/grpc-server-demo/gen/proto"
	"google.golang.org/grpc"
)

var (
	port = flag.Int("port", 50051, "The server port")
)

type server struct {
	gen.UnsafeHelloServiceServer
}

func NewHelloServer() gen.HelloServiceServer {
	return &server{}
}

func (s *server) SayHello(
	ctx context.Context,
	in *gen.HelloRequest,
) (*gen.HelloResponse, error) {
	log.Printf("Received: %v", in.GetName())
	return &gen.HelloResponse{
		Message: "Hello " + in.GetName(),
	}, nil
}

func (s *server) StreamHello(stream gen.HelloService_StreamHelloServer) error {
	revieved := make([]string, 0)
	for i := 0; ; i++ {
		req, err := stream.Recv()
		switch err {
		case nil:
		case io.EOF:
			return nil
		default:
			return err
		}

		log.Printf("Stream Recieved %d: %v", i, req.GetName())
		revieved = append(revieved, req.GetName())
		stream.Send(&gen.HelloResponse{
			Message: "Hello: " + strings.Join(revieved, ", "),
		})
	}
}

func main() {
	flag.Parse()
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	s := grpc.NewServer()
	gen.RegisterHelloServiceServer(s, NewHelloServer())
	log.Printf("Server is listening on port 50051")
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
