import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { BUCKET_PREFIX } from './constants/pipeline';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
/**
 * Creates a stack with an ingestion bucket, a destination bucket
 * and a Lambda function that converts images upload to the ingestion bucket
 * into thumbnails stored in the destination bucket.
 *
 * When an image is uploaded to the ingestion bucket, the service will
 * compress the image to a smaller, thumbnail-sized image.
 *
 *
 * Example:
 * ```ts
 * declare const this: Construct;
 * const stack = new ThumbnailCdkStack(this, 'ThumbnailGeneratorStack');
 * ```
 *
 */
export class ThumbnailCdkStack extends Stack {
  /** Bucket that stores thumbnail images */
  destinationBucket: Bucket;

  /** Bucket that accepts images to be converted to thumbnails */
  inputBucket: Bucket;

  /**
   * @constructor
   */
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.inputBucket = new Bucket(this, 'ThumbnailImageIngestionBucket', {
      bucketName: `${BUCKET_PREFIX}-thumbnail-image-ingestion-${this.region}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    this.destinationBucket = new Bucket(this, 'ThumbnailImageDestinationBucket', {
      bucketName: `${BUCKET_PREFIX}-thumbnail-images-destination-${this.region}`,
    });

    this.createThumbnailGeneratorLambda();
  }

  /**
   * Creates Lambda that converts images uploaded to ingestion bucket into
   * image thumbnails in destination bucket
   */
  private createThumbnailGeneratorLambda = (): void => {
    const s3EventSource = new S3EventSource(this.inputBucket, {
      events: [EventType.OBJECT_CREATED],
    });

    const pillowLayer = new PythonLayerVersion(this, 'PillowLayer', {
      entry: 'src/layers/PillowLayer',
      compatibleRuntimes: [Runtime.PYTHON_3_8],
    });

    const imageProcessor = new PythonFunction(this, 'ImageProcessor', {
      functionName: 'ImageProcessor',
      entry: 'src/lambda/CreateThumbnail',
      handler: 'lambda_handler',
      index: 'createThumbnail.py',
      layers: [pillowLayer],
      runtime: Runtime.PYTHON_3_8,
      memorySize: 512,
      timeout: Duration.minutes(1),
      environment: {
        DestinationBucket: this.destinationBucket.bucketName,
      },
      events: [s3EventSource],
    });

    imageProcessor.addToRolePolicy(
      new PolicyStatement({
        sid: 'GetImageFromSourceAndDelete',
        effect: Effect.ALLOW,
        actions: ['s3:GetObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [`${this.inputBucket.bucketArn}/*`, this.inputBucket.bucketArn],
      })
    );
    imageProcessor.addToRolePolicy(
      new PolicyStatement({
        sid: 'PutThumbnailInDestinationBucket',
        effect: Effect.ALLOW,
        actions: ['s3:PutObject'],
        resources: [`${this.destinationBucket.bucketArn}/*`],
      })
    );
  };
}
