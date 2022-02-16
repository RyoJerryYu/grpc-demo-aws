import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const stackName = `${pulumi.getProject()}-${pulumi.getStack()}`;
const stackConfig = new pulumi.Config("stack");
const awsConfig = new pulumi.Config("aws");
const config = {
    region: awsConfig.require("region"),
    
    primAZ: stackConfig.require("primaz"),
    subAZ: stackConfig.require("subaz"),
    ami: stackConfig.require("ami"),
};


/**
 * 
 * NetWork
 * 
 */

const vpc = new aws.ec2.Vpc("vpc", {
    cidrBlock: "10.100.0.0/16",
    enableDnsHostnames: true,
    tags: {
        Name: "gRPCHello-VPC",
        PulumiStack: stackName,
    }
})

const internetGateway = new aws.ec2.InternetGateway("Pulumi-InternetGateway", {
    vpcId: vpc.id,
    tags: {
        Name: "gRPCHello-igw",
        PulumiStack: stackName,
    }
})

const publicRouteTable = new aws.ec2.RouteTable("Pulumi-PublicRouteTable", {
    vpcId: vpc.id,
    routes: [
        {
            cidrBlock: "0.0.0.0/0",
            gatewayId: internetGateway.id,
        }
    ],
    tags: {
        Name: "gRPCHello-PublicRouteTable",
        PulumiStack: stackName,
    }
})

const primPublicSubnet = new aws.ec2.Subnet("public-subnet", {
    vpcId: vpc.id,
    availabilityZone: config.primAZ,
    cidrBlock: "10.100.1.0/24",
    mapPublicIpOnLaunch: true,
    tags: {
        Name: "gRPCHello-public-subnet",
        PulumiStack: stackName,
    }
})

const subPublicSubnet = new aws.ec2.Subnet("public-subnet", {
    vpcId: vpc.id,
    availabilityZone: config.primAZ,
    cidrBlock: "10.100.1.0/24",
    mapPublicIpOnLaunch: true,
    tags: {
        Name: "gRPCHello-public-subnet",
        PulumiStack: stackName,
    }
})

const primPublicRouteTableAssociation = new aws.ec2.RouteTableAssociation(
    "public-subnet-route-table-association",
    {
        routeTableId: publicRouteTable.id,
        subnetId: primPublicSubnet.id,
    },
)

const subPublicRouteTableAssociation = new aws.ec2.RouteTableAssociation(
    "public-subnet-route-table-association",
    {
        routeTableId: publicRouteTable.id,
        subnetId: primPublicSubnet.id,
    },
)

const privateRouteTable = new aws.ec2.RouteTable("Pulumi-PrivateRouteTable", {
    vpcId: vpc.id,
    routes: [], // private net could not access internet
    tags: {
        Name: "gRPCHello-PrivateRouteTable",
        PulumiStack: stackName,
    }
})

const privateSubnet = new aws.ec2.Subnet("private-subnet", {
    vpcId: vpc.id,
    availabilityZone: config.primAZ,
    cidrBlock: "10.100.11.0/24",
    mapPublicIpOnLaunch: false,
    tags: {
        Name: "gRPCHello-private-subnet",
        PulumiStack: stackName,
    },
})

const privateRouteTableAssociation = new aws.ec2.RouteTableAssociation(
    "private-subnet-route-table-association",
    {
        routeTableId: privateRouteTable.id,
        subnetId: privateSubnet.id,
    },
)


/**
 * 
 * Server
 * 
 */

const sshableGroup = new aws.ec2.SecurityGroup("Pulumi-SshableGroup", {
    name: "gRPCHello-SshableGroup",
    description: `Created by Pulumi stack ${stackName}`,
    vpcId: vpc.id,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
            description: "SSH port 22",
        }
    ],
    tags: {
        Name: "gRPCHello-SshableGroup",
        PulumiStack: stackName,
    }
})

const lbGroup = new aws.ec2.SecurityGroup("Pulumi-PublicGroup", {
    name: "gRPCHello-PublicGroup",
    description: `Created by Pulumi stack ${stackName}`,
    vpcId: vpc.id,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 50051,
            toPort: 50051,
            cidrBlocks: ["0.0.0.0/0"],
            description: "50051 public for every where",
        },
    ],
    egress: [
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }
    ],
    tags: {
        Name: "gRPCHello-PublicGroup",
        PulumiStack: stackName,
    }
})

const lb = new aws.lb.LoadBalancer("Pulumi-LoadBalancer", {
    name: "gRPCHello-LoadBalancer",
    loadBalancerType: "application",

    internal: false,
    securityGroups: [lbGroup.id],
    subnets: [primPublicSubnet.id], // when multi-az, could use public subnet in both az
    enableDeletionProtection: false,
    // accessLogs: {
    //     bucket: aws_s3_bucket.lb_logs.bucket,
    //     prefix: "test-lb",
    //     enabled: true,
    // },
    enableHttp2: true,
    dropInvalidHeaderFields: false,
    tags: {
        Name: "gRPCHello-LoadBalancer",
        PulumiStack: stackName,
    }
})

const grpcListener = new aws.lb.Listener("Pulumi-grpcListener", {
    loadBalancerArn: lb.arn,
    defaultActions: [
        {
            type: "forward",
            // targetGroupArn: lb.targetGroup.arn,
        }
    ],
})

const serverTGroup = new aws.lb.TargetGroup("Pulumi-ServerTargetGroup", {
    name: "gRPCHello-ServerTargetGroup",
    vpcId: vpc.id,
    targetType: "instance",
    protocol: "HTTP",
    protocolVersion: "HTTP2",
    port: 50051,
})

const serverSGroup = new aws.ec2.SecurityGroup("Pulumi-ServerGroup", {
    name: "gRPCHello-ServerGroup",
    description: `Created by Pulumi stack ${stackName}`,
    vpcId: vpc.id,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 50051,
            toPort: 50051,
            securityGroups: [lbGroup.id],
            description: "only accessable from lb",
        },
    ],
    egress: [
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }
    ],
    tags: {
        Name: "gRPCHello-ServerGroup",
        PulumiStack: stackName,
    }
})

const grpcServer = new aws.ec2.Instance("grpc-server", {
    ami: config.ami, // an image with our server running on it
    instanceType: "t2.micro",
    subnetId: primPublicSubnet.id, // build instance in each az could be better
    vpcSecurityGroupIds: [sshableGroup.id, lbGroup.id],
    tags: {
        Name: "gRPCHello-grpc-server",
        PulumiStack: stackName,
    }
})

export const grpcServerPublicIp = grpcServer.publicIp;
