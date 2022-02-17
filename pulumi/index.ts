import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { type } from "os";

const stackName = `${pulumi.getProject()}-${pulumi.getStack()}`;
const stackConfig = new pulumi.Config("stack");
const awsConfig = new pulumi.Config("aws");
const config = {
    region: awsConfig.require("region"),

    primAZ: stackConfig.require("primaz"),
    subAZ: stackConfig.require("subaz"),
    ami: stackConfig.require("ami"),
    certDomain: stackConfig.require("certdomain"),
    lbLogBucket: stackConfig.require("lblogbucket"),
    recordZone: stackConfig.require("recordzone"),
    recordName: stackConfig.require("recordname"),
};


/**
 * 
 * Network Infra
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

const privateRouteTable = new aws.ec2.RouteTable("Pulumi-PrivateRouteTable", {
    vpcId: vpc.id,
    routes: [], // private net could not access internet
    tags: {
        Name: "gRPCHello-PrivateRouteTable",
        PulumiStack: stackName,
    }
})

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

const lbGroup = new aws.ec2.SecurityGroup("Pulumi-LbGroup", {
    name: "gRPCHello-LbGroup",
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
});




/**
 * 
 * Infra for Multi-AZ
 * 
 */

const publicSubnets: aws.ec2.Subnet[] = [];
const grpcServers: aws.ec2.Instance[] = [];
[config.primAZ, config.subAZ].forEach((az, i) => {
    const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
        vpcId: vpc.id,
        availabilityZone: az,
        cidrBlock: `10.100.${i}.0/24`,
        mapPublicIpOnLaunch: true,
        tags: {
            Name: `gRPCHello-public-subnet`,
            PulumiStack: stackName,
        }
    })

    const publicRouteTableAssociation = new aws.ec2.RouteTableAssociation(
        `public-subnet-route-table-association-${i}`,
        {
            routeTableId: publicRouteTable.id,
            subnetId: publicSubnet.id,
        },
    )

    const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
        vpcId: vpc.id,
        availabilityZone: az,
        cidrBlock: `10.100.1${i}.0/24`,
        mapPublicIpOnLaunch: false,
        tags: {
            Name: `gRPCHello-private-subnet`,
            PulumiStack: stackName,
        },
    })

    const privateRouteTableAssociation = new aws.ec2.RouteTableAssociation(
        `private-subnet-route-table-association-${i}`,
        {
            routeTableId: privateRouteTable.id,
            subnetId: privateSubnet.id,
        },
    )


    const grpcServer = new aws.ec2.Instance(`grpc-server-${i}`, {
        ami: config.ami, // an image with our server running on it
        instanceType: "t2.micro",
        subnetId: publicSubnet.id,
        vpcSecurityGroupIds: [sshableGroup.id, lbGroup.id],
        tags: {
            Name: "gRPCHello-grpc-server",
            PulumiStack: stackName,
        }
    })


    publicSubnets.push(publicSubnet);
    grpcServers.push(grpcServer);
})



/**
 * 
 * Load Balancer
 * 
 */

const lb = new aws.lb.LoadBalancer("Pulumi-LoadBalancer", {
    name: "gRPCHello-LoadBalancer",
    loadBalancerType: "application",

    internal: false,
    securityGroups: [lbGroup.id],
    subnets: publicSubnets.map(s => s.id),
    enableDeletionProtection: false,
    accessLogs: {
        bucket: config.lbLogBucket,
        prefix: "grpc-lb",
        enabled: true,
    },
    enableHttp2: true,
    dropInvalidHeaderFields: false,
    tags: {
        Name: "gRPCHello-LoadBalancer",
        PulumiStack: stackName,
    }
})

// use gRPC tGroup

const serverTGroup = new aws.lb.TargetGroup("Pulumi-ServerTargetGroup", {
    name: "gRPCHello-ServerTargetGroup",
    vpcId: vpc.id,
    targetType: "instance",
    protocol: "HTTP",
    protocolVersion: "GRPC",
    port: 50051,
    healthCheck: {
        path: "/",
        matcher: "12",
    }
});

grpcServers.map((s,i) => {
    const serverTGroupAttachment = new aws.lb.TargetGroupAttachment(
        `Pulumi-ServerTargetGroupAttachment-${i}`,
        {
            targetGroupArn: serverTGroup.arn,
            targetId: s.id,
            port: 50051,
        }
    )
})

const lbRecord = new aws.route53.Record("Pulumi-LoadBalancerRecord", {
    name: `${config.recordName}.${config.recordZone}`,
    type: "A",
    zoneId: aws.route53.getZone({ name: config.recordZone }, {async:true}).then(z => z.id),
    aliases: [
        {
            name: lb.dnsName,
            zoneId: lb.zoneId,
            evaluateTargetHealth: true,
        }
    ],
})

const cert = aws.acm.getCertificateOutput({
    domain: config.certDomain,
    statuses: ["ISSUED"],
})

const grpcListener = new aws.lb.Listener("Pulumi-grpcListener", {
    loadBalancerArn: lb.arn,
    port: 50051,
    protocol: "HTTPS",
    certificateArn: cert.arn,
    sslPolicy: "ELBSecurityPolicy-2016-08",
    defaultActions: [
        {
            type: "forward",
            targetGroupArn: serverTGroup.arn,
        }
    ],
})
